"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";

const bool = (data: FormData, name: string) => data.get(name) === "on";

export async function saveNotificationPreferences(data: FormData) {
  const member = await requireMember();
  const values = {
    inAppMessages: bool(data, "inAppMessages"),
    inAppSessions: bool(data, "inAppSessions"),
    inAppCommunity: bool(data, "inAppCommunity"),
    inAppRecommendations: bool(data, "inAppRecommendations"),
    inAppAccount: bool(data, "inAppAccount"),
    emailMessages: bool(data, "emailMessages"),
    emailSessions: bool(data, "emailSessions"),
    emailCommunity: bool(data, "emailCommunity"),
    emailRecommendations: bool(data, "emailRecommendations"),
    emailAccount: bool(data, "emailAccount"),
  };
  await getPrismaClient().notificationPreference.upsert({
    where: { userId: member.id },
    create: { userId: member.id, ...values },
    update: values,
  });
  revalidatePath("/notifications");
  revalidatePath("/notifications/preferences");
  redirect("/notifications/preferences?saved=1");
}

export async function markNotificationRead(data: FormData) {
  const member = await requireMember();
  const id = String(data.get("notificationId") ?? "").trim();
  if (!id || id.length > 40) return;
  await getPrismaClient().notification.updateMany({
    where: { id, recipientId: member.id, inApp: true, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
  revalidatePath("/member");
}

export async function markAllNotificationsRead() {
  const member = await requireMember();
  await getPrismaClient().notification.updateMany({
    where: { recipientId: member.id, inApp: true, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
  revalidatePath("/member");
}
