import "server-only";
import type { DisputeOutcome, Prisma } from "@/generated/prisma/client";
import {
  creditPostingEnabled,
  ensureCreditAccount,
  lockCreditWallet,
  postBalancedCreditTransaction,
} from "@/lib/credit-ledger";

export async function applyDisputeCreditOutcome(
  tx: Prisma.TransactionClient,
  input: {
    disputeId: string;
    sessionId: string;
    actorId: string;
    outcome: DisputeOutcome;
    version: string;
    reverseTransactionId?: string | null;
  },
) {
  if (!creditPostingEnabled())
    throw new Error(
      "Credit posting remains disabled by default. Explicitly enable the approved Phase 1 policy for a controlled beta.",
    );
  const session = await tx.session.findUnique({
    where: { id: input.sessionId },
    include: { exchangeRequest: { select: { type: true } } },
  });
  if (!session || session.exchangeRequest.type !== "CREDIT_LEARNING")
    throw new Error("This dispute does not use the credit-learning settlement flow.");
  let hold = await tx.creditHold.findUnique({ where: { sessionId: input.sessionId } });
  if (!hold) return null;

  if (input.reverseTransactionId) {
    if (!["RELEASED", "SETTLED"].includes(hold.status) || !hold.closeTransactionId)
      throw new Error("The previous dispute ledger outcome is not available to reverse.");
    const previous = await tx.creditLedgerTransaction.findUnique({
      where: { id: input.reverseTransactionId },
      include: { entries: { select: { accountId: true, amount: true } } },
    });
    if (!previous || previous.id !== hold.closeTransactionId)
      throw new Error("The ledger close does not match this dispute hold.");
    await postBalancedCreditTransaction(tx, {
      idempotencyKey: `dispute-reversal:${input.disputeId}:${previous.id}`,
      type: "REVERSAL",
      actorId: input.actorId,
      sessionId: session.id,
      reversalOfId: previous.id,
      reason: "Reverse the previous ledger outcome after an Admin upheld the appeal.",
      postings: previous.entries.map((entry) => ({
        accountId: entry.accountId,
        amount: -entry.amount,
        source: "ADMIN_ADJUSTMENT" as const,
      })),
      metadata: { disputeId: input.disputeId, appealReversal: true },
    });
    hold = await tx.creditHold.update({
      where: { id: hold.id },
      data: { status: "FROZEN", closeTransactionId: null, closedAt: null },
    });
  }

  if (hold.status !== "FROZEN")
    throw new Error("This dispute does not have a frozen credit hold to resolve.");
  await lockCreditWallet(tx, hold.userId);
  const held = await ensureCreditAccount(tx, "MEMBER_HELD", hold.userId);
  const spendable = await ensureCreditAccount(tx, "MEMBER_SPENDABLE", hold.userId);
  const idempotencyKey = `dispute-final:${input.disputeId}:${input.version}`;
  if (input.outcome === "RETURN_TO_LEARNER") {
    const ledgerTx = await postBalancedCreditTransaction(tx, {
      idempotencyKey,
      type: "HOLD_RELEASE",
      actorId: input.actorId,
      sessionId: session.id,
      reason: "Return the learner's frozen session credits under the Admin dispute decision.",
      metadata: { disputeId: input.disputeId, outcome: input.outcome },
      postings: [
        { accountId: held.id, amount: -hold.amount, source: "HOLD_RELEASE" },
        { accountId: spendable.id, amount: hold.amount, source: "HOLD_RELEASE" },
      ],
    });
    return tx.creditHold.update({
      where: { id: hold.id },
      data: { status: "RELEASED", closeTransactionId: ledgerTx.id, closedAt: new Date() },
    });
  }

  const retention = 1;
  if (hold.amount <= retention)
    throw new Error("The held session price is too low for the approved platform retention.");
  const teacher = await ensureCreditAccount(tx, "MEMBER_SPENDABLE", session.teacherId);
  const revenue = await ensureCreditAccount(tx, "PLATFORM_REVENUE");
  const ledgerTx = await postBalancedCreditTransaction(tx, {
    idempotencyKey,
    type: "SESSION_SETTLEMENT",
    actorId: input.actorId,
    sessionId: session.id,
    reason: "Pay the teacher under the Admin dispute decision.",
    metadata: { disputeId: input.disputeId, outcome: input.outcome },
    postings: [
      { accountId: held.id, amount: -hold.amount, source: "SESSION_PAYMENT" },
      { accountId: teacher.id, amount: hold.amount - retention, source: "TEACHING" },
      { accountId: revenue.id, amount: retention, source: "PLATFORM_RETENTION" },
    ],
  });
  return tx.creditHold.update({
    where: { id: hold.id },
    data: { status: "SETTLED", closeTransactionId: ledgerTx.id, closedAt: new Date() },
  });
}
