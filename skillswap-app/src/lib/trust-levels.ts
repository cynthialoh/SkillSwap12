import "server-only";
import type { Prisma } from "@/generated/prisma/client";

export async function refreshMemberTrustLevel(
  tx: Prisma.TransactionClient,
  userId: string,
  actorId: string,
) {
  const profile = await tx.memberProfile.findUnique({
    where: { userId },
    select: { trustLevel: true },
  });
  if (!profile) return null;
  const policy = await tx.trustPolicy.findUnique({ where: { id: "default" } });
  const completed = await tx.session.findMany({
    where: {
      status: "COMPLETED",
      OR: [{ learnerId: userId }, { teacherId: userId }],
      exchangeRequest: {
        OR: [
          { type: "CREDIT_LEARNING" },
          {
            type: "DIRECT_SWAP",
            directSwap: { is: { status: { in: ["SETTLED", "COMPLETED_PENDING_SETTLEMENT"] } } },
          },
        ],
      },
    },
    select: { exchangeRequestId: true },
    distinct: ["exchangeRequestId"],
  });
  const exchangeCount = completed.length;
  const level =
    exchangeCount >= (policy?.level4CompletedExchanges ?? 25)
      ? 4
      : exchangeCount >= (policy?.level3CompletedExchanges ?? 10)
        ? 3
        : exchangeCount >= (policy?.level2CompletedExchanges ?? 3)
          ? 2
          : 1;
  // Trust level only increases automatically. Reviews and a single poor rating
  // never lower a member's level or trigger a restriction.
  if (level <= profile.trustLevel) return null;
  await tx.memberProfile.update({ where: { userId }, data: { trustLevel: level } });
  await tx.trustLevelEvent.create({
    data: {
      userId,
      actorId,
      fromLevel: profile.trustLevel,
      toLevel: level,
      reasonCode: "COMPLETED_EXCHANGES",
      reason: `Trust level increased after ${exchangeCount} completed exchanges.`,
    },
  });
  await tx.securityAuditEvent.create({
    data: {
      eventKey: "TRUST_LEVEL_INCREASED",
      actorId,
      targetUserId: userId,
      reason: `Completed-exchange threshold reached (${exchangeCount}).`,
      details: { fromLevel: profile.trustLevel, toLevel: level, exchangeCount },
    },
  });
  return { fromLevel: profile.trustLevel, toLevel: level, exchangeCount };
}
