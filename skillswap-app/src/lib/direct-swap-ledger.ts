import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  creditPostingEnabled,
  ensureCreditAccount,
  getMemberCreditTotals,
  lockCreditWallet,
  postBalancedCreditTransaction,
  releaseSessionCreditHold,
} from "@/lib/credit-ledger";

export function directSwapDepositForValue(skillValue: number) {
  if (!Number.isSafeInteger(skillValue) || skillValue < 1) {
    throw new Error("Direct-swap skill values must be positive whole credits.");
  }
  return Math.ceil(skillValue / 2);
}

export async function holdDirectSwapDeposits(
  tx: Prisma.TransactionClient,
  directSwapId: string,
  actorId: string,
) {
  if (!creditPostingEnabled()) {
    throw new Error(
      "Direct-swap deposits are disabled by default until the approved Phase 1 policy is explicitly enabled.",
    );
  }
  const swap = await tx.directSwap.findUnique({
    where: { id: directSwapId },
    include: { exchangeRequest: { include: { sessions: { orderBy: { legNumber: "asc" } } } } },
  });
  if (
    !swap ||
    swap.status === "RESOLUTION_PENDING" ||
    swap.status === "MUTUAL_CANCELLATION_PENDING"
  ) {
    throw new Error("This direct swap is not ready to hold deposits.");
  }
  if (swap.exchangeRequest.sessions.length !== 2) {
    throw new Error("Schedule both direct-swap sessions before confirming either session time.");
  }
  const [targetSession, offerSession] = swap.exchangeRequest.sessions;
  if (
    targetSession.legNumber !== 1 ||
    offerSession.legNumber !== 2 ||
    targetSession.learnerId !== swap.requesterId ||
    offerSession.learnerId !== swap.recipientId
  ) {
    throw new Error("The direct-swap session participants do not match the accepted agreement.");
  }
  for (const session of [targetSession, offerSession]) {
    if (!session.priceCredits) throw new Error("Both direct-swap credit values must be set.");
    const amount = directSwapDepositForValue(session.priceCredits);
    const existing = await tx.creditHold.findUnique({ where: { sessionId: session.id } });
    if (existing) {
      if (existing.status !== "ACTIVE" || existing.amount !== amount) {
        throw new Error("A direct-swap deposit already exists in a different state.");
      }
      continue;
    }
    await lockCreditWallet(tx, session.learnerId);
    const totals = await getMemberCreditTotals(tx, session.learnerId);
    if (totals.spendable < amount) {
      throw new Error("Both members need enough spendable credits for their direct-swap deposit.");
    }
    const spendable = await ensureCreditAccount(tx, "MEMBER_SPENDABLE", session.learnerId);
    const held = await ensureCreditAccount(tx, "MEMBER_HELD", session.learnerId);
    const posting = await postBalancedCreditTransaction(tx, {
      idempotencyKey: `direct-swap-hold:${swap.id}:${session.legNumber}`,
      type: "SESSION_HOLD",
      actorId,
      sessionId: session.id,
      reason: "Hold the participant's direct-swap accountability deposit.",
      postings: [
        { accountId: spendable.id, amount: -amount, source: "SESSION_HOLD" },
        { accountId: held.id, amount, source: "SESSION_HOLD" },
      ],
    });
    await tx.creditHold.create({
      data: {
        sessionId: session.id,
        userId: session.learnerId,
        amount,
        holdTransactionId: posting.id,
      },
    });
  }
  return [targetSession.id, offerSession.id] as const;
}

export async function releaseDirectSwapDeposits(
  tx: Prisma.TransactionClient,
  directSwapId: string,
  actorId: string,
  reason: string,
  requireActiveHolds = false,
) {
  const swap = await tx.directSwap.findUnique({
    where: { id: directSwapId },
    include: { exchangeRequest: { include: { sessions: { orderBy: { legNumber: "asc" } } } } },
  });
  if (!swap || swap.exchangeRequest.sessions.length !== 2) {
    throw new Error("Both direct-swap sessions must exist before deposits are released.");
  }
  if (requireActiveHolds) {
    const holds = await tx.creditHold.findMany({
      where: { sessionId: { in: swap.exchangeRequest.sessions.map((session) => session.id) } },
      select: { status: true },
    });
    if (holds.length !== 2 || holds.some((hold) => hold.status !== "ACTIVE")) {
      throw new Error(
        "Both active direct-swap deposits are required before success can be settled.",
      );
    }
  }
  for (const session of swap.exchangeRequest.sessions) {
    await releaseSessionCreditHold(tx, session.id, actorId, reason);
  }
}

export type DirectSwapResolutionOutcome =
  | "LATE_CANCEL_BEFORE_TAUGHT"
  | "FAILURE_AFTER_TAUGHT"
  | "EMERGENCY_COMPENSATION";

export async function resolveDirectSwapCredits(
  tx: Prisma.TransactionClient,
  input: {
    directSwapId: string;
    actorId: string;
    outcome: DirectSwapResolutionOutcome;
    responsibleUserId?: string;
    reason: string;
  },
) {
  if (!creditPostingEnabled()) {
    throw new Error(
      "Direct-swap credit outcomes are disabled by default until the approved Phase 1 policy is explicitly enabled.",
    );
  }
  const swap = await tx.directSwap.findUnique({
    where: { id: input.directSwapId },
    include: {
      exchangeRequest: {
        include: {
          sessions: {
            orderBy: { legNumber: "asc" },
            include: {
              creditHold: true,
              incidents: {
                where: { status: "ACCEPTED" },
                select: { id: true, type: true, reporterId: true, reportedUserId: true },
              },
            },
          },
        },
      },
    },
  });
  if (!swap || swap.status !== "RESOLUTION_PENDING") {
    throw new Error("This direct swap is not awaiting resolution.");
  }
  const sessions = swap.exchangeRequest.sessions;
  if (sessions.length !== 2)
    throw new Error("Both linked sessions are required for direct-swap resolution.");
  const responsibleUserId = input.responsibleUserId;
  if (!responsibleUserId || ![swap.requesterId, swap.recipientId].includes(responsibleUserId)) {
    throw new Error("Choose the responsible direct-swap participant.");
  }
  const recipientUserId =
    responsibleUserId === swap.requesterId ? swap.recipientId : swap.requesterId;
  if (input.outcome === "EMERGENCY_COMPENSATION") {
    const emergency = sessions.flatMap((session) =>
      session.incidents
        .filter(
          (incident) => incident.type === "EMERGENCY" && incident.reporterId === responsibleUserId,
        )
        .map((incident) => ({ incident, session })),
    )[0];
    if (!emergency?.session.priceCredits) {
      throw new Error(
        "Emergency compensation requires an upheld report from the affected participant.",
      );
    }
    const award = Math.ceil(emergency.session.priceCredits / 2);
    await releaseDirectSwapDeposits(tx, swap.id, input.actorId, input.reason);
    await lockCreditWallet(tx, responsibleUserId);
    const affectedSpendable = await ensureCreditAccount(tx, "MEMBER_SPENDABLE", responsibleUserId);
    const reserve = await ensureCreditAccount(tx, "PLATFORM_RESERVE");
    await postBalancedCreditTransaction(tx, {
      idempotencyKey: `direct-swap-emergency:${swap.id}`,
      type: "DIRECT_SWAP_SETTLEMENT",
      actorId: input.actorId,
      sessionId: emergency.session.id,
      reason: input.reason,
      metadata: {
        directSwapId: swap.id,
        outcome: input.outcome,
        affectedUserId: responsibleUserId,
        incidentId: emergency.incident.id,
        awardCredits: award,
      },
      postings: [
        { accountId: reserve.id, amount: -award, source: "DIRECT_SWAP_COMPENSATION" },
        { accountId: affectedSpendable.id, amount: award, source: "DIRECT_SWAP_COMPENSATION" },
      ],
    });
    return { status: "RESOLVED" as const, responsibleUserId, amount: award };
  }
  const responsibleSession = sessions.find((session) => session.learnerId === responsibleUserId);
  const recipientSession = sessions.find((session) => session.learnerId === recipientUserId);
  const responsibleHold = responsibleSession?.creditHold;
  if (
    !responsibleSession ||
    !recipientSession ||
    !responsibleHold ||
    responsibleHold.status !== "ACTIVE"
  ) {
    throw new Error("The responsible member's active accountability deposit could not be found.");
  }
  let reward = 0;
  let rewardSessionId: string | null = null;
  if (input.outcome === "LATE_CANCEL_BEFORE_TAUGHT") {
    const acceptedNoShow = sessions.some((session) =>
      session.incidents.some((incident) => incident.type === "NO_SHOW"),
    );
    if (!swap.cancellationWasLate && !acceptedNoShow) {
      throw new Error("This outcome requires a late cancellation or an upheld no-show report.");
    }
    if (
      sessions.some(
        (session) => session.status === "COMPLETED" && session.teacherId === recipientUserId,
      )
    ) {
      throw new Error(
        "The other participant has already taught a completed leg; use the taught-leg outcome.",
      );
    }
    reward = responsibleHold.amount;
  } else {
    const acceptedNoShow = sessions.some((session) =>
      session.incidents.some((incident) => incident.type === "NO_SHOW"),
    );
    if (!swap.cancellationWasLate && !acceptedNoShow) {
      throw new Error("This outcome requires a late cancellation or an upheld no-show report.");
    }
    const taughtSession = sessions.find(
      (session) => session.status === "COMPLETED" && session.teacherId === recipientUserId,
    );
    if (!taughtSession?.priceCredits) {
      throw new Error("The other participant has no completed teaching leg to compensate.");
    }
    reward = taughtSession.priceCredits;
    rewardSessionId = taughtSession.id;
  }

  for (const userId of [responsibleUserId, recipientUserId].sort()) {
    await lockCreditWallet(tx, userId);
  }
  const held = await ensureCreditAccount(tx, "MEMBER_HELD", responsibleUserId);
  const recipientSpendable = await ensureCreditAccount(tx, "MEMBER_SPENDABLE", recipientUserId);
  const reserve = await ensureCreditAccount(tx, "PLATFORM_RESERVE");
  const reserveDelta = responsibleHold.amount - reward;
  const postings = [
    {
      accountId: held.id,
      amount: -responsibleHold.amount,
      source: "DIRECT_SWAP_FORFEITURE" as const,
    },
    {
      accountId: recipientSpendable.id,
      amount: reward,
      source:
        input.outcome === "LATE_CANCEL_BEFORE_TAUGHT"
          ? ("DIRECT_SWAP_FORFEITURE" as const)
          : ("DIRECT_SWAP_COMPENSATION" as const),
    },
    ...(reserveDelta === 0
      ? []
      : [
          {
            accountId: reserve.id,
            amount: reserveDelta,
            source:
              reserveDelta > 0
                ? ("DIRECT_SWAP_FORFEITURE" as const)
                : ("DIRECT_SWAP_COMPENSATION" as const),
          },
        ]),
  ];
  const settlement = await postBalancedCreditTransaction(tx, {
    idempotencyKey: `direct-swap-resolution:${swap.id}`,
    type: "DIRECT_SWAP_SETTLEMENT",
    actorId: input.actorId,
    sessionId: responsibleSession.id,
    reason: input.reason,
    metadata: {
      directSwapId: swap.id,
      outcome: input.outcome,
      responsibleUserId,
      recipientUserId,
      depositCredits: responsibleHold.amount,
      rewardCredits: reward,
      rewardSessionId,
    },
    postings,
  });
  await tx.creditHold.update({
    where: { id: responsibleHold.id, status: "ACTIVE" },
    data: { status: "SETTLED", closeTransactionId: settlement.id, closedAt: new Date() },
  });
  if (recipientSession.creditHold?.status === "ACTIVE") {
    await releaseSessionCreditHold(tx, recipientSession.id, input.actorId, input.reason);
  }
  return { status: "RESOLVED" as const, responsibleUserId, amount: reward };
}
