import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { lockMemberPair } from "@/lib/interaction-policy";

export async function applyBlock(
  tx: Prisma.TransactionClient,
  blockerId: string,
  blockedUserId: string,
) {
  await lockMemberPair(tx, blockerId, blockedUserId);
  await tx.profileBlock.upsert({
    where: { blockerId_blockedUserId: { blockerId, blockedUserId } },
    create: { blockerId, blockedUserId },
    update: {},
  });
  await tx.profileAccessRequest.updateMany({
    where: {
      OR: [
        { requesterId: blockerId, ownerId: blockedUserId },
        { requesterId: blockedUserId, ownerId: blockerId },
      ],
    },
    data: { status: "BLOCKED", decidedAt: new Date() },
  });
  await tx.followedPerson.deleteMany({
    where: {
      OR: [
        { userId: blockerId, personId: blockedUserId },
        { userId: blockedUserId, personId: blockerId },
      ],
    },
  });
  await tx.followedSkill.deleteMany({
    where: {
      OR: [
        { userId: blockerId, skillListing: { userId: blockedUserId } },
        { userId: blockedUserId, skillListing: { userId: blockerId } },
      ],
    },
  });
  const pendingExchanges = await tx.exchangeRequest.findMany({
    where: {
      status: "PENDING",
      OR: [
        { requesterId: blockerId, recipientId: blockedUserId },
        { requesterId: blockedUserId, recipientId: blockerId },
      ],
    },
    select: { id: true },
  });
  await tx.exchangeRequest.updateMany({
    where: { id: { in: pendingExchanges.map((r) => r.id) } },
    data: { status: "BLOCKED", respondedAt: new Date() },
  });
  if (pendingExchanges.length)
    await tx.requestActivity.createMany({
      data: pendingExchanges.map((r) => ({
        exchangeRequestId: r.id,
        actorId: blockerId,
        eventKey: "BLOCKED",
        fromState: "PENDING",
        toState: "BLOCKED",
        summary: "Request closed by a safety block.",
      })),
    });
  await tx.learningRequestResponse.updateMany({
    where: {
      status: "PENDING",
      OR: [
        { responderId: blockerId, request: { ownerId: blockedUserId } },
        { responderId: blockedUserId, request: { ownerId: blockerId } },
      ],
    },
    data: { status: "BLOCKED", decidedAt: new Date() },
  });
  const pair = await tx.connection.findFirst({
    where: {
      OR: [
        { memberLowId: blockerId, memberHighId: blockedUserId },
        { memberLowId: blockedUserId, memberHighId: blockerId },
      ],
    },
    select: { id: true },
  });
  if (pair) {
    await tx.connection.update({ where: { id: pair.id }, data: { status: "BLOCKED" } });
    await tx.conversation.updateMany({
      where: { connectionId: pair.id },
      data: { isActive: false },
    });
  }
  const activeSessions = await tx.session.findMany({
    where: {
      status: { in: ["PROPOSED", "CONFIRMED"] },
      OR: [
        { learnerId: blockerId, teacherId: blockedUserId },
        { learnerId: blockedUserId, teacherId: blockerId },
      ],
    },
    select: { id: true, status: true },
  });
  if (activeSessions.length) {
    const sessionIds = activeSessions.map((session) => session.id);
    await tx.session.updateMany({
      where: { id: { in: sessionIds } },
      data: { status: "CANCELLED", cancellationReason: "Closed by a member safety action." },
    });
    await tx.sessionTimeProposal.updateMany({
      where: { sessionId: { in: sessionIds }, status: "PENDING" },
      data: { status: "SUPERSEDED", respondedAt: new Date() },
    });
    await tx.sessionReminder.deleteMany({ where: { sessionId: { in: sessionIds }, sentAt: null } });
    await tx.sessionEvent.createMany({
      data: activeSessions.map((session) => ({
        sessionId: session.id,
        actorId: blockerId,
        eventKey: "SAFETY_CLOSED",
        fromState: session.status,
        toState: "CANCELLED",
        summary: "The session was closed by a member safety action.",
      })),
    });
  }
}
