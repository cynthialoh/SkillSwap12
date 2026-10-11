"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SafetyReportCategory } from "@/generated/prisma/client";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { enqueueNotification } from "@/lib/notifications";
import {
  assertCanMessage,
  assertCanReadConversation,
  consumeRateLimit,
  InteractionError,
} from "@/lib/interaction-policy";

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
function go(path: string, error?: string, key = "error"): never {
  redirect(
    path + (error ? (path.includes("?") ? "&" : "?") + key + "=" + encodeURIComponent(error) : ""),
  );
}
async function capture(task: () => Promise<void>) {
  try {
    await task();
    return null;
  } catch (error) {
    if (error instanceof InteractionError) return error.message;
    throw error;
  }
}
export async function sendMessage(data: FormData) {
  const member = await requireMember();
  const conversationId = text(data, "conversationId");
  const body = text(data, "body");
  const error = await capture(async () => {
    if (body.length < 1 || body.length > 4000)
      throw new InteractionError("Messages must be between 1 and 4,000 characters.");
    await consumeRateLimit(member.id, "message", 20, 10 * 60 * 1000);
    const otherId = await assertCanMessage(member.id, conversationId);
    const now = new Date();
    const message = await getPrismaClient().$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: conversationId, isActive: true, connection: { status: "ACTIVE" } },
        select: { connectionId: true },
      });
      if (!conversation) throw new InteractionError("Messaging is currently unavailable.");
      const locked = await tx.connection.updateMany({
        where: { id: conversation.connectionId, status: "ACTIVE" },
        data: { updatedAt: now },
      });
      if (!locked.count) throw new InteractionError("Messaging is currently unavailable.");
      const created = await tx.message.create({
        data: { conversationId, senderId: member.id, body },
        select: { id: true },
      });
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } });
      await tx.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId: otherId } },
        data: { unreadCount: { increment: 1 } },
      });
      return created;
    });
    await enqueueNotification({
      recipientId: otherId,
      actorId: member.id,
      category: "MESSAGE",
      eventKey: "NEW_MESSAGE",
      idempotencyKey: `message:${message.id}`,
      title: "You have a new SkillSwap message",
      body: `${member.profile?.displayName || "A Member"}: ${body.slice(0, 320)}`,
      href: `/messages/${conversationId}`,
    });
  });
  if (error) go("/messages/" + conversationId, error);
  revalidatePath("/messages/" + conversationId);
  revalidatePath("/connections");
  go("/messages/" + conversationId);
}
export async function markConversationRead(conversationId: string) {
  const member = await requireMember();
  const error = await capture(async () => {
    await assertCanReadConversation(member.id, conversationId);
    await getPrismaClient().conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: member.id } },
      data: { lastReadAt: new Date(), unreadCount: 0 },
    });
  });
  if (error) go("/connections", error);
}
export async function disconnectMember(data: FormData) {
  const member = await requireMember();
  const connectionId = text(data, "connectionId");
  const connection = await getPrismaClient().connection.findFirst({
    where: {
      id: connectionId,
      status: "ACTIVE",
      OR: [{ memberLowId: member.id }, { memberHighId: member.id }],
    },
    select: { id: true },
  });
  if (!connection) go("/connections", "Connection is no longer active.");
  await getPrismaClient().$transaction([
    getPrismaClient().connection.update({
      where: { id: connection.id },
      data: { status: "CLOSED" },
    }),
    getPrismaClient().conversation.updateMany({
      where: { connectionId: connection.id },
      data: { isActive: false },
    }),
  ]);
  revalidatePath("/connections");
  revalidatePath("/member");
  go("/connections", "Connection closed.", "notice");
}
export async function createSafetyReport(data: FormData) {
  const member = await requireMember();
  const reportedUserId = text(data, "reportedUserId");
  const conversationId = text(data, "conversationId") || null;
  const messageId = text(data, "messageId") || null;
  const category = text(data, "category") as SafetyReportCategory;
  const details = text(data, "details");
  const context = text(data, "context");
  const validCategories = [
    "HARASSMENT",
    "SCAM",
    "INAPPROPRIATE_CONTENT",
    "SAFETY",
    "SPAM",
    "OTHER",
  ];
  const error = await capture(async () => {
    if (
      !reportedUserId ||
      reportedUserId === member.id ||
      !validCategories.includes(category) ||
      details.length < 20 ||
      details.length > 2000 ||
      context.length > 1000
    )
      throw new InteractionError(
        "Choose a report reason and provide at least 20 characters of context.",
      );
    await consumeRateLimit(member.id, "safety-report", 5, 24 * 60 * 60 * 1000);
    const target = await getPrismaClient().user.findUnique({
      where: { id: reportedUserId },
      select: { id: true },
    });
    if (!target) throw new InteractionError("This member could not be found.");
    if (conversationId) {
      const conversation = await getPrismaClient().conversation.findFirst({
        where: {
          id: conversationId,
          participants: { some: { userId: member.id } },
          connection: { OR: [{ memberLowId: reportedUserId }, { memberHighId: reportedUserId }] },
        },
        select: { id: true },
      });
      if (!conversation) throw new InteractionError("The conversation context is not available.");
    }
    if (messageId) {
      const message = await getPrismaClient().message.findFirst({
        where: {
          id: messageId,
          conversationId: conversationId ?? undefined,
          senderId: reportedUserId,
          conversation: { participants: { some: { userId: member.id } } },
        },
        select: { id: true },
      });
      if (!message) throw new InteractionError("The message context is not available.");
    }
    await getPrismaClient().safetyReport.create({
      data: {
        reporterId: member.id,
        reportedUserId,
        category,
        details,
        context: context || null,
        conversationId,
        messageId,
      },
    });
  });
  if (error) go("/safety/report", error);
  revalidatePath("/admin");
  revalidatePath("/safety/report");
  go("/safety/report", "Report received. The safety team can review it privately.", "notice");
}
