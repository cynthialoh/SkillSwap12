import "server-only";
import { getPrismaClient } from "@/lib/db/prisma";

export class InteractionError extends Error {}
export function windowFloor(milliseconds: number) {
  return new Date(Math.floor(Date.now() / milliseconds) * milliseconds);
}
export async function consumeRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowMs: number,
) {
  const rows = await getPrismaClient().$queryRawUnsafe<Array<{ count: number }>>(
    'INSERT INTO "ActionRateLimit" ("userId", "action", "windowStart", "count") VALUES ($1, $2, $3, 1) ON CONFLICT ("userId", "action", "windowStart") DO UPDATE SET "count" = "ActionRateLimit"."count" + 1 WHERE "ActionRateLimit"."count" < $4 RETURNING "count"',
    userId,
    action,
    windowFloor(windowMs),
    limit,
  );
  if (!rows.length)
    throw new InteractionError(
      "You have reached the limit for this action. Please try again later.",
    );
}
export async function assertNoBlock(firstId: string, secondId: string) {
  const block = await getPrismaClient().profileBlock.findFirst({
    where: {
      OR: [
        { blockerId: firstId, blockedUserId: secondId },
        { blockerId: secondId, blockedUserId: firstId },
      ],
    },
    select: { id: true },
  });
  if (block) throw new InteractionError("This interaction is not available.");
}

export async function lockMemberPair(
  tx: import("@/generated/prisma/client").Prisma.TransactionClient,
  firstId: string,
  secondId: string,
) {
  const ids = [firstId, secondId].sort((a, b) => a.localeCompare(b));
  await tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "User" WHERE "id" = ANY($1::text[]) ORDER BY "id" FOR UPDATE',
    ids,
  );
}

export async function assertNoBlockInTransaction(
  tx: import("@/generated/prisma/client").Prisma.TransactionClient,
  firstId: string,
  secondId: string,
) {
  const block = await tx.profileBlock.findFirst({
    where: {
      OR: [
        { blockerId: firstId, blockedUserId: secondId },
        { blockerId: secondId, blockedUserId: firstId },
      ],
    },
    select: { id: true },
  });
  if (block) throw new InteractionError("This interaction is not available.");
}
export async function assertAvailableMember(
  userId: string,
  accepts: "acceptLearningRequests" | "acceptDirectSwapRequests",
) {
  const target = await getPrismaClient().user.findFirst({
    where: {
      id: userId,
      status: "ACTIVE",
      adminGrant: null,
      authUser: { is: { emailVerified: true } },
      memberProfile: {
        is: {
          onboardingCompletedAt: { not: null },
          isDiscoverable: true,
          [accepts]: true,
          OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: new Date() } }],
        },
      },
    },
    select: { id: true },
  });
  if (!target) throw new InteractionError("This member is not accepting requests.");
  return target;
}
export async function createConnection(
  tx: import("@/generated/prisma/client").Prisma.TransactionClient,
  first: string,
  second: string,
) {
  await lockMemberPair(tx, first, second);
  await assertNoBlockInTransaction(tx, first, second);
  const [memberLowId, memberHighId] = [first, second].sort((a, b) => a.localeCompare(b));
  const connection = await tx.connection.upsert({
    where: { memberLowId_memberHighId: { memberLowId, memberHighId } },
    create: { memberLowId, memberHighId, status: "ACTIVE" },
    update: { status: "ACTIVE" },
  });
  const existingConversation = await tx.conversation.findFirst({
    where: { connectionId: connection.id, isActive: true },
    select: { id: true },
  });
  if (existingConversation) return { connection, conversation: existingConversation };
  const conversation = await tx.conversation.create({
    data: {
      connectionId: connection.id,
      participants: { create: [{ userId: first }, { userId: second }] },
    },
    select: { id: true },
  });
  return { connection, conversation };
}
export async function assertCanMessage(userId: string, conversationId: string) {
  const conversation = await getPrismaClient().conversation.findFirst({
    where: {
      id: conversationId,
      isActive: true,
      connection: { status: "ACTIVE", OR: [{ memberLowId: userId }, { memberHighId: userId }] },
      participants: { some: { userId } },
    },
    select: { connection: { select: { memberLowId: true, memberHighId: true } } },
  });
  if (!conversation) throw new InteractionError("Conversation not found.");
  const otherId =
    conversation.connection.memberLowId === userId
      ? conversation.connection.memberHighId
      : conversation.connection.memberLowId;
  await assertNoBlock(userId, otherId);
  const pair = await getPrismaClient().user.findMany({
    where: { id: { in: [userId, otherId] }, status: "ACTIVE" },
    select: { id: true, memberProfile: { select: { acceptMessages: true } } },
  });
  if (pair.length !== 2 || pair.some((u) => !u.memberProfile?.acceptMessages))
    throw new InteractionError("Messaging is currently unavailable.");
  return otherId;
}

export async function assertCanReadConversation(userId: string, conversationId: string) {
  const conversation = await getPrismaClient().conversation.findFirst({
    where: {
      id: conversationId,
      isActive: true,
      connection: { status: "ACTIVE", OR: [{ memberLowId: userId }, { memberHighId: userId }] },
      participants: { some: { userId } },
    },
    select: { connection: { select: { memberLowId: true, memberHighId: true } } },
  });
  if (!conversation) throw new InteractionError("Conversation not found.");
  const otherId =
    conversation.connection.memberLowId === userId
      ? conversation.connection.memberHighId
      : conversation.connection.memberLowId;
  await assertNoBlock(userId, otherId);
  const pair = await getPrismaClient().user.findMany({
    where: { id: { in: [userId, otherId] }, status: "ACTIVE" },
    select: { id: true },
  });
  if (pair.length !== 2) throw new InteractionError("Conversation not found.");
  return otherId;
}
