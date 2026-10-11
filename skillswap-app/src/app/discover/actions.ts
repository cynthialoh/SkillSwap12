"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  assertNoBlockInTransaction,
  consumeRateLimit,
  InteractionError,
  lockMemberPair,
} from "@/lib/interaction-policy";
import type { PersonalizationMode } from "@/generated/prisma/client";

async function validTarget(targetId: string) {
  const member = await requireMember();
  if (!targetId || targetId === member.id) throw new Error("Choose another member.");
  const prisma = getPrismaClient();
  const [target, block, muted] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: targetId,
        status: "ACTIVE",
        adminGrant: null,
        memberProfile: {
          is: {
            isDiscoverable: true,
            OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: new Date() } }],
          },
        },
      },
      select: { id: true },
    }),
    prisma.profileBlock.findFirst({
      where: {
        OR: [
          { blockerId: member.id, blockedUserId: targetId },
          { blockerId: targetId, blockedUserId: member.id },
        ],
      },
      select: { id: true },
    }),
    prisma.mutedMember.findFirst({
      where: {
        OR: [
          { userId: member.id, mutedUserId: targetId },
          { userId: targetId, mutedUserId: member.id },
        ],
      },
      select: { userId: true },
    }),
  ]);
  if (!target || block || muted) throw new Error("This member is not available.");
  return member;
}
export async function toggleSavedTeacher(data: FormData) {
  const targetId = String(data.get("targetId") ?? "");
  const member = await validTarget(targetId);
  const prisma = getPrismaClient();
  const where = { userId_teacherId: { userId: member.id, teacherId: targetId } };
  if (await prisma.savedTeacher.findUnique({ where })) await prisma.savedTeacher.delete({ where });
  else await prisma.savedTeacher.create({ data: { userId: member.id, teacherId: targetId } });
  revalidatePath("/discover");
  revalidatePath("/saved");
  redirect("/discover");
}
export async function toggleFollowPerson(data: FormData) {
  const targetId = String(data.get("targetId") ?? "");
  const member = await validTarget(targetId);
  try {
    await consumeRateLimit(member.id, "follow", 30, 10 * 60 * 1000);
  } catch (error) {
    if (error instanceof InteractionError) redirect("/discover?error=rate_limit");
    throw error;
  }
  const prisma = getPrismaClient();
  const where = { userId_personId: { userId: member.id, personId: targetId } };
  await prisma.$transaction(async (tx) => {
    await lockMemberPair(tx, member.id, targetId);
    await assertNoBlockInTransaction(tx, member.id, targetId);
    if (await tx.followedPerson.findUnique({ where })) await tx.followedPerson.delete({ where });
    else await tx.followedPerson.create({ data: { userId: member.id, personId: targetId } });
  });
  revalidatePath("/discover");
  revalidatePath("/saved");
  redirect("/discover");
}
async function validListing(listingId: string, memberId: string) {
  const prisma = getPrismaClient();
  const listing = await prisma.skillListing.findFirst({
    where: {
      id: listingId,
      isActive: true,
      userId: { not: memberId },
      user: {
        status: "ACTIVE",
        adminGrant: null,
        memberProfile: {
          is: {
            isDiscoverable: true,
            OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: new Date() } }],
          },
        },
      },
    },
    select: { id: true, userId: true },
  });
  if (!listing) throw new Error("This skill is not available.");
  const block = await prisma.profileBlock.findFirst({
    where: {
      OR: [
        { blockerId: memberId, blockedUserId: listing.userId },
        { blockerId: listing.userId, blockedUserId: memberId },
      ],
    },
    select: { id: true },
  });
  const muted = await prisma.mutedMember.findFirst({
    where: {
      OR: [
        { userId: memberId, mutedUserId: listing.userId },
        { userId: listing.userId, mutedUserId: memberId },
      ],
    },
    select: { userId: true },
  });
  if (block || muted) throw new Error("This skill is not available.");
  return listing;
}
export async function toggleSavedSkill(data: FormData) {
  const member = await requireMember();
  const listingId = String(data.get("listingId") ?? "");
  await validListing(listingId, member.id);
  const prisma = getPrismaClient();
  const where = { userId_skillListingId: { userId: member.id, skillListingId: listingId } };
  if (await prisma.savedSkill.findUnique({ where })) await prisma.savedSkill.delete({ where });
  else await prisma.savedSkill.create({ data: { userId: member.id, skillListingId: listingId } });
  revalidatePath("/discover");
  revalidatePath("/saved");
  redirect("/discover");
}
export async function toggleFollowSkill(data: FormData) {
  const member = await requireMember();
  const listingId = String(data.get("listingId") ?? "");
  try {
    await consumeRateLimit(member.id, "follow", 30, 10 * 60 * 1000);
  } catch (error) {
    if (error instanceof InteractionError) redirect("/discover?error=rate_limit");
    throw error;
  }
  const listing = await validListing(listingId, member.id);
  const prisma = getPrismaClient();
  const where = { userId_skillListingId: { userId: member.id, skillListingId: listingId } };
  await prisma.$transaction(async (tx) => {
    await lockMemberPair(tx, member.id, listing.userId);
    await assertNoBlockInTransaction(tx, member.id, listing.userId);
    if (await tx.followedSkill.findUnique({ where })) await tx.followedSkill.delete({ where });
    else await tx.followedSkill.create({ data: { userId: member.id, skillListingId: listingId } });
  });
  revalidatePath("/discover");
  revalidatePath("/saved");
  redirect("/discover");
}
export async function dismissRecommendation(data: FormData) {
  const targetId = String(data.get("targetId") ?? "");
  const member = await validTarget(targetId);
  const reason =
    String(data.get("reason") ?? "")
      .trim()
      .slice(0, 250) || null;
  await getPrismaClient().dismissedRecommendation.upsert({
    where: { userId_targetId: { userId: member.id, targetId } },
    create: { userId: member.id, targetId, reason },
    update: { reason },
  });
  revalidatePath("/discover");
  redirect("/discover");
}
export async function updateDiscoveryPreferences(data: FormData) {
  const member = await requireMember();
  const mode = String(data.get("mode") ?? "") as PersonalizationMode;
  const minimumTrustLevel = Number(data.get("minimumTrustLevel") ?? 1);
  const minimumDirectSwapTrust = Number(data.get("minimumDirectSwapTrust") ?? 1);
  if (
    !["ACTIVE", "PAUSED", "OFF"].includes(mode) ||
    !Number.isInteger(minimumTrustLevel) ||
    minimumTrustLevel < 1 ||
    minimumTrustLevel > 10 ||
    !Number.isInteger(minimumDirectSwapTrust) ||
    minimumDirectSwapTrust < 1 ||
    minimumDirectSwapTrust > 10
  )
    redirect("/discover?error=preferences");
  await getPrismaClient().discoveryPreference.upsert({
    where: { userId: member.id },
    create: {
      userId: member.id,
      personalizationMode: mode,
      minimumTrustLevel,
      minimumDirectSwapTrust,
      useTrustLevel: data.get("useTrustLevel") === "on",
    },
    update: {
      personalizationMode: mode,
      minimumTrustLevel,
      minimumDirectSwapTrust,
      useTrustLevel: data.get("useTrustLevel") === "on",
    },
  });
  revalidatePath("/discover");
  revalidatePath("/discover/swaps");
  redirect("/discover");
}
export async function resetDiscoveryPreferences() {
  const member = await requireMember();
  await getPrismaClient().discoveryPreference.upsert({
    where: { userId: member.id },
    create: { userId: member.id },
    update: {
      personalizationMode: "ACTIVE",
      useTrustLevel: true,
      minimumTrustLevel: 1,
      minimumDirectSwapTrust: 1,
    },
  });
  revalidatePath("/discover");
  revalidatePath("/discover/swaps");
  redirect("/discover");
}
