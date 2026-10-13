import "server-only";
import type {
  CreditAccountType,
  CreditSource,
  CreditTransactionType,
  Prisma,
} from "@/generated/prisma/client";

export const APPROVED_CREDIT_POLICY_VERSION = "phase1-approved-v1";
export const PROFILE_COMPLETION_REWARD = 4;
export const REFERRAL_INVITER_REWARD = 3;

export function creditPostingEnabled() {
  return (
    process.env.CREDIT_SETTLEMENT_ENABLED === "true" &&
    process.env.SKILLSWAP_CREDIT_POLICY_APPROVED_VERSION === APPROVED_CREDIT_POLICY_VERSION
  );
}

export function creditGiftingEnabled() {
  return (
    process.env.CREDIT_GIFTS_ENABLED === "true" &&
    process.env.SKILLSWAP_CREDIT_POLICY_APPROVED_VERSION === APPROVED_CREDIT_POLICY_VERSION
  );
}

export class CreditLedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditLedgerError";
  }
}

type Posting = { accountId: string; amount: number; source: CreditSource };

export async function lockCreditWallet(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE',
    userId,
  );
}

export async function ensureCreditAccount(
  tx: Prisma.TransactionClient,
  type: CreditAccountType,
  userId?: string,
) {
  const code = userId ? `member:${userId}:${type.toLowerCase()}` : `system:${type.toLowerCase()}`;
  return tx.creditAccount.upsert({
    where: { code },
    create: { code, type, userId: userId ?? null },
    update: {},
    select: { id: true, code: true, type: true, userId: true },
  });
}

export async function postBalancedCreditTransaction(
  tx: Prisma.TransactionClient,
  input: {
    idempotencyKey: string;
    type: CreditTransactionType;
    actorId?: string | null;
    sessionId?: string | null;
    reason?: string | null;
    reversalOfId?: string | null;
    postings: Posting[];
    metadata?: Prisma.InputJsonValue;
  },
) {
  const existing = await tx.creditLedgerTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true, idempotencyKey: true, type: true },
  });
  if (existing) return existing;
  if (
    input.postings.length < 2 ||
    input.postings.some((posting) => !Number.isSafeInteger(posting.amount) || posting.amount === 0)
  ) {
    throw new CreditLedgerError(
      "A credit transaction needs at least two nonzero integer postings.",
    );
  }
  if (input.postings.reduce((total, posting) => total + posting.amount, 0) !== 0) {
    throw new CreditLedgerError("Credit transaction postings must balance to zero.");
  }
  const accountIds = input.postings.map((posting) => posting.accountId);
  if (new Set(accountIds).size !== accountIds.length) {
    throw new CreditLedgerError("Each account can appear only once in a credit transaction.");
  }
  // The Phase 8 database guard compares this timestamp to transaction_timestamp()
  // before allowing child entries. Use PostgreSQL's exact transaction time rather
  // than the Prisma client's clock/default for cross-host consistency.
  const [{ transactionTime }] = await tx.$queryRaw<Array<{ transactionTime: Date }>>`
    SELECT transaction_timestamp()::TIMESTAMP(3) AS "transactionTime"
  `;
  return tx.creditLedgerTransaction.create({
    data: {
      idempotencyKey: input.idempotencyKey,
      createdAt: transactionTime,
      type: input.type,
      actorId: input.actorId ?? null,
      sessionId: input.sessionId ?? null,
      reason: input.reason ?? null,
      reversalOfId: input.reversalOfId ?? null,
      metadata: input.metadata,
      entries: {
        create: input.postings.map(({ accountId, amount, source }) => ({
          accountId,
          amount,
          source,
        })),
      },
    },
    select: { id: true, idempotencyKey: true, type: true },
  });
}

export async function getMemberCreditTotals(tx: Prisma.TransactionClient, userId: string) {
  const [spendable, held] = await Promise.all([
    tx.creditLedgerEntry.aggregate({
      where: { account: { userId, type: "MEMBER_SPENDABLE" } },
      _sum: { amount: true },
    }),
    tx.creditLedgerEntry.aggregate({
      where: { account: { userId, type: "MEMBER_HELD" } },
      _sum: { amount: true },
    }),
  ]);
  return { spendable: spendable._sum.amount ?? 0, held: held._sum.amount ?? 0 };
}

/** Ensure each completed Member profile receives its one-time welcome reward. */
export async function ensureProfileCompletionReward(tx: Prisma.TransactionClient, userId: string) {
  const profile = await tx.memberProfile.findUnique({
    where: { userId },
    select: { onboardingCompletedAt: true },
  });
  if (!profile?.onboardingCompletedAt) return false;

  const idempotencyKey = `profile-completion-reward:${userId}`;
  const existing = await tx.creditLedgerTransaction.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (existing) return false;

  await lockCreditWallet(tx, userId);
  const prior = await tx.creditLedgerTransaction.findUnique({
    where: { idempotencyKey },
    select: { id: true },
  });
  if (prior) return false;

  const memberAccount = await ensureCreditAccount(tx, "MEMBER_SPENDABLE", userId);
  const promotionReserve = await ensureCreditAccount(tx, "PROMOTION_RESERVE");
  await postBalancedCreditTransaction(tx, {
    idempotencyKey,
    type: "PROMOTION",
    reason: "One-time reward for completing a Member profile.",
    metadata: { reward: "PROFILE_COMPLETION", amount: PROFILE_COMPLETION_REWARD },
    postings: [
      {
        accountId: promotionReserve.id,
        amount: -PROFILE_COMPLETION_REWARD,
        source: "PROMOTIONAL",
      },
      {
        accountId: memberAccount.id,
        amount: PROFILE_COMPLETION_REWARD,
        source: "PROMOTIONAL",
      },
    ],
  });
  return true;
}

/** Credit the inviter once an active referred member completes onboarding. */
export async function rewardReferralInviter(
  tx: Prisma.TransactionClient,
  inviteeId: string,
  rawCode: string,
) {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-F0-9]{12}$/.test(code)) return false;

  const [referralCode, invitee] = await Promise.all([
    tx.referralCode.findUnique({ where: { code }, select: { id: true, userId: true } }),
    tx.user.findUnique({
      where: { id: inviteeId },
      select: { status: true, memberProfile: { select: { onboardingCompletedAt: true } } },
    }),
  ]);
  if (
    !referralCode ||
    referralCode.userId === inviteeId ||
    invitee?.status !== "ACTIVE" ||
    !invitee.memberProfile?.onboardingCompletedAt
  ) {
    return false;
  }

  const claim = await tx.referralClaim.upsert({
    where: { inviteeId },
    create: { referralCodeId: referralCode.id, inviteeId },
    update: {},
  });
  if (claim.referralCodeId !== referralCode.id || claim.rewardedAt) return false;

  for (const userId of [referralCode.userId, inviteeId].sort()) {
    await lockCreditWallet(tx, userId);
  }
  const inviterAccount = await ensureCreditAccount(tx, "MEMBER_SPENDABLE", referralCode.userId);
  const referralReserve = await ensureCreditAccount(tx, "REFERRAL_RESERVE");
  await postBalancedCreditTransaction(tx, {
    idempotencyKey: `referral-inviter-reward:${claim.id}`,
    type: "REFERRAL",
    actorId: inviteeId,
    reason: "Reward for inviting a member who completed their profile.",
    metadata: {
      reward: "REFERRAL_INVITER",
      referralClaimId: claim.id,
      amount: REFERRAL_INVITER_REWARD,
    },
    postings: [
      { accountId: referralReserve.id, amount: -REFERRAL_INVITER_REWARD, source: "REFERRAL" },
      { accountId: inviterAccount.id, amount: REFERRAL_INVITER_REWARD, source: "REFERRAL" },
    ],
  });
  await tx.referralClaim.update({ where: { id: claim.id }, data: { rewardedAt: new Date() } });
  return true;
}

function assertPolicyEnabled() {
  if (!creditPostingEnabled()) {
    throw new CreditLedgerError(
      "Credit holds and settlement are disabled by default. Enable the approved Phase 1 policy explicitly for a controlled beta.",
    );
  }
}

export async function holdCreditsForConfirmedSession(
  tx: Prisma.TransactionClient,
  sessionId: string,
  actorId: string,
) {
  assertPolicyEnabled();
  const session = await tx.session.findUnique({
    where: { id: sessionId },
    include: { exchangeRequest: { select: { type: true } }, creditHold: true },
  });
  if (
    !session ||
    session.status !== "CONFIRMED" ||
    session.exchangeRequest.type !== "CREDIT_LEARNING"
  ) {
    throw new CreditLedgerError("Only confirmed credit-learning sessions can hold credits.");
  }
  if (!session.priceCredits || session.priceCredits < 2) {
    throw new CreditLedgerError("This session does not have an approved credit price.");
  }
  if (session.creditHold) return session.creditHold;

  await lockCreditWallet(tx, session.learnerId);
  const totals = await getMemberCreditTotals(tx, session.learnerId);
  if (totals.spendable < session.priceCredits) {
    throw new CreditLedgerError("Your spendable credit balance is too low for this session.");
  }
  const spendable = await ensureCreditAccount(tx, "MEMBER_SPENDABLE", session.learnerId);
  const held = await ensureCreditAccount(tx, "MEMBER_HELD", session.learnerId);
  const ledgerTx = await postBalancedCreditTransaction(tx, {
    idempotencyKey: `session-hold:${session.id}`,
    type: "SESSION_HOLD",
    actorId,
    sessionId: session.id,
    reason: "Reserve the listed session price until the session outcome is resolved.",
    postings: [
      { accountId: spendable.id, amount: -session.priceCredits, source: "SESSION_HOLD" },
      { accountId: held.id, amount: session.priceCredits, source: "SESSION_HOLD" },
    ],
  });
  return tx.creditHold.create({
    data: {
      sessionId: session.id,
      userId: session.learnerId,
      amount: session.priceCredits,
      holdTransactionId: ledgerTx.id,
    },
  });
}

export async function releaseSessionCreditHold(
  tx: Prisma.TransactionClient,
  sessionId: string,
  actorId: string,
  reason: string,
) {
  assertPolicyEnabled();
  const hold = await tx.creditHold.findUnique({ where: { sessionId } });
  if (!hold || hold.status !== "ACTIVE") return hold;
  await lockCreditWallet(tx, hold.userId);
  const held = await ensureCreditAccount(tx, "MEMBER_HELD", hold.userId);
  const spendable = await ensureCreditAccount(tx, "MEMBER_SPENDABLE", hold.userId);
  const closeTx = await postBalancedCreditTransaction(tx, {
    idempotencyKey: `session-release:${hold.id}`,
    type: "HOLD_RELEASE",
    actorId,
    sessionId,
    reason,
    postings: [
      { accountId: held.id, amount: -hold.amount, source: "HOLD_RELEASE" },
      { accountId: spendable.id, amount: hold.amount, source: "HOLD_RELEASE" },
    ],
  });
  return tx.creditHold.update({
    where: { id: hold.id, status: "ACTIVE" },
    data: { status: "RELEASED", closeTransactionId: closeTx.id, closedAt: new Date() },
  });
}

export async function settleCompletedCreditSession(
  tx: Prisma.TransactionClient,
  sessionId: string,
  actorId: string,
) {
  assertPolicyEnabled();
  const session = await tx.session.findUnique({ where: { id: sessionId } });
  const hold = await tx.creditHold.findUnique({ where: { sessionId } });
  if (
    !session ||
    session.status !== "COMPLETED" ||
    !session.learnerCompletedAt ||
    !session.teacherCompletedAt
  ) {
    throw new CreditLedgerError(
      "Settlement requires both participants to mark the session complete.",
    );
  }
  if (!hold || hold.status !== "ACTIVE") return hold;
  const teacherSpendable = await ensureCreditAccount(tx, "MEMBER_SPENDABLE", session.teacherId);
  const learnerHeld = await ensureCreditAccount(tx, "MEMBER_HELD", session.learnerId);
  const platformRevenue = await ensureCreditAccount(tx, "PLATFORM_REVENUE");
  const retention = 1;
  if (hold.amount <= retention)
    throw new CreditLedgerError("Session price must exceed the platform retention.");
  const settlementTx = await postBalancedCreditTransaction(tx, {
    idempotencyKey: `session-settlement:${session.id}`,
    type: "SESSION_SETTLEMENT",
    actorId,
    sessionId,
    reason: "Settle a completed credit-learning session.",
    postings: [
      { accountId: learnerHeld.id, amount: -hold.amount, source: "SESSION_PAYMENT" },
      { accountId: teacherSpendable.id, amount: hold.amount - retention, source: "TEACHING" },
      { accountId: platformRevenue.id, amount: retention, source: "PLATFORM_RETENTION" },
    ],
  });
  return tx.creditHold.update({
    where: { id: hold.id, status: "ACTIVE" },
    data: { status: "SETTLED", closeTransactionId: settlementTx.id, closedAt: new Date() },
  });
}
