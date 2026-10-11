import "server-only";

import type { NotificationCategory } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";

type NotificationInput = {
  recipientId: string;
  actorId?: string | null;
  category: NotificationCategory;
  eventKey: string;
  idempotencyKey: string;
  title: string;
  body: string;
  href: string;
};

const inAppPreference: Record<NotificationCategory, string> = {
  MESSAGE: "inAppMessages",
  SESSION: "inAppSessions",
  COMMUNITY: "inAppCommunity",
  RECOMMENDATION: "inAppRecommendations",
  ACCOUNT: "inAppAccount",
};

const emailPreference: Record<NotificationCategory, string> = {
  MESSAGE: "emailMessages",
  SESSION: "emailSessions",
  COMMUNITY: "emailCommunity",
  RECOMMENDATION: "emailRecommendations",
  ACCOUNT: "emailAccount",
};

export async function enqueueNotification(input: NotificationInput) {
  const href = input.href.startsWith("/") && !input.href.startsWith("//") ? input.href : "/member";
  const prisma = getPrismaClient();
  try {
    if (input.actorId && input.actorId !== input.recipientId) {
      const relationshipBlock = await prisma.profileBlock.findFirst({
        where: {
          OR: [
            { blockerId: input.actorId, blockedUserId: input.recipientId },
            { blockerId: input.recipientId, blockedUserId: input.actorId },
          ],
        },
        select: { id: true },
      });
      if (relationshipBlock) return;
      if (input.category === "COMMUNITY" || input.category === "RECOMMENDATION") {
        const muted = await prisma.mutedMember.findUnique({
          where: { userId_mutedUserId: { userId: input.recipientId, mutedUserId: input.actorId } },
          select: { userId: true },
        });
        if (muted) return;
      }
    }
    const preferences = await prisma.notificationPreference.findUnique({
      where: { userId: input.recipientId },
    });
    const preferenceValues = preferences as unknown as Record<string, boolean> | null;
    const showInApp = preferences
      ? (preferenceValues?.[inAppPreference[input.category]] ?? true)
      : true;
    const sendEmail = preferences
      ? (preferenceValues?.[emailPreference[input.category]] ?? false)
      : input.category === "MESSAGE" || input.category === "SESSION";
    if (!showInApp && !sendEmail) return;

    const notification = await prisma.notification.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: {
        ...input,
        href,
        actorId: input.actorId || null,
        inApp: showInApp,
      },
      update: {},
      select: { id: true },
    });
    if (sendEmail) {
      await prisma.emailDelivery.upsert({
        where: { notificationId: notification.id },
        create: { notificationId: notification.id },
        update: {},
      });
    }
  } catch (error) {
    console.error("Notification enqueue failed", { eventKey: input.eventKey, error });
  }
}
