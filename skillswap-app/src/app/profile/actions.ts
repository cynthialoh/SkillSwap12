"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { AccessDeniedError, requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { applyBlock } from "@/lib/blocking";
import { sendTransactionalEmail } from "@/lib/email/zeptomail";
import { deletePrivateR2Object, uploadPrivateR2Object } from "@/lib/storage/r2";
import {
  memberMediaMaxBytes,
  memberMediaTypes,
  mediaMatchesSignature,
  profileImageMaxBytes,
} from "@/lib/member-media-validation";
import type {
  ExperienceLevel,
  ProfileAccessStatus,
  SkillDirection,
} from "@/generated/prisma/client";

export type FormState = { error?: string; success?: string };
const levels: ExperienceLevel[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"];
const directions: SkillDirection[] = ["TEACH", "LEARN"];
const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const checked = (data: FormData, key: string) => data.get(key) === "on";
const paths = (id: string) => {
  revalidatePath("/profile/edit");
  revalidatePath("/member");
  revalidatePath(`/profiles/${id}`);
};
function failure(error: unknown): FormState {
  return {
    error:
      error instanceof AccessDeniedError
        ? error.message
        : "We could not save that change. Please try again.",
  };
}
async function notifyProfileChange(to: string | null | undefined, subject: string, body: string) {
  if (!to) return;
  try {
    await sendTransactionalEmail({
      to,
      subject,
      text: body,
      html: `<p>${body}</p><p>Open SkillSwap to review your profile access requests.</p>`,
    });
  } catch {
    console.error("Profile access notification could not be delivered.");
  }
}

export async function updateProfileSettings(_state: FormState, data: FormData): Promise<FormState> {
  try {
    const member = await requireMember();
    const displayName = text(data, "displayName");
    const bio = text(data, "bio");
    const location = text(data, "location");
    const timezone = text(data, "timezone");
    const visibility = text(data, "profileVisibility");
    if (displayName.length < 2 || displayName.length > 80)
      return { error: "Name must be between 2 and 80 characters." };
    if (bio.length > 500 || location.length > 120)
      return { error: "About must be under 500 characters and location under 120." };
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      return { error: "Enter a valid IANA time zone." };
    }
    if (visibility !== "PUBLIC" && visibility !== "PRIVATE")
      return { error: "Choose a valid profile visibility." };
    await getPrismaClient().memberProfile.update({
      where: { userId: member.id },
      data: {
        displayName,
        bio: bio || null,
        location: location || null,
        timezone,
        profileVisibility: visibility,
        isDiscoverable: checked(data, "isDiscoverable"),
        acceptLearningRequests: checked(data, "acceptLearningRequests"),
        acceptDirectSwapRequests: checked(data, "acceptDirectSwapRequests"),
        acceptMessages: checked(data, "acceptMessages"),
        privacyReviewRequired: false,
      },
    });
    paths(member.id);
    return { success: "Profile and privacy settings saved." };
  } catch (error) {
    return failure(error);
  }
}

export async function uploadProfileImage(data: FormData): Promise<void> {
  const member = await requireMember();
  const file = data.get("profileImage");
  if (
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > profileImageMaxBytes ||
    !["image/png", "image/jpeg", "image/webp"].includes(file.type)
  ) {
    redirect("/profile/edit?mediaError=profile-image");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!mediaMatchesSignature(file.type, bytes)) redirect("/profile/edit?mediaError=profile-image");
  const prisma = getPrismaClient();
  const previous = await prisma.memberProfile.findUnique({
    where: { userId: member.id },
    select: { profileImageObjectKey: true },
  });
  const objectKey = `member-avatar/${member.id}/${randomUUID()}`;
  try {
    await uploadPrivateR2Object(objectKey, Buffer.from(bytes), file.type);
    await prisma.memberProfile.update({
      where: { userId: member.id },
      data: { profileImageObjectKey: objectKey },
    });
  } catch (error) {
    console.error(
      "Profile image storage failed:",
      error instanceof Error ? error.message : "Unknown storage error.",
    );
    try {
      await deletePrivateR2Object(objectKey);
    } catch {
      /* A retention sweep can remove an orphaned upload. */
    }
    redirect("/profile/edit?mediaError=storage");
  }
  if (previous?.profileImageObjectKey) {
    try {
      await deletePrivateR2Object(previous.profileImageObjectKey);
    } catch {
      /* Keep the new profile image if cleanup fails. */
    }
  }
  revalidatePath("/profile/edit");
  revalidatePath("/member");
  revalidatePath(`/profiles/${member.id}`);
  redirect("/profile/edit?mediaSaved=1");
}

export async function removeProfileImage(): Promise<void> {
  const member = await requireMember();
  const prisma = getPrismaClient();
  const profile = await prisma.memberProfile.findUnique({
    where: { userId: member.id },
    select: { profileImageObjectKey: true },
  });
  await prisma.memberProfile.update({
    where: { userId: member.id },
    data: { profileImageObjectKey: null },
  });
  if (profile?.profileImageObjectKey) {
    try {
      await deletePrivateR2Object(profile.profileImageObjectKey);
    } catch {
      /* The database no longer exposes this image. */
    }
  }
  revalidatePath("/profile/edit");
  revalidatePath("/member");
  revalidatePath(`/profiles/${member.id}`);
  redirect("/profile/edit?mediaSaved=1");
}

export async function uploadMemberGallery(data: FormData): Promise<void> {
  const member = await requireMember();
  const files = data
    .getAll("gallery")
    .filter((value): value is File => value instanceof File && value.size > 0);
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (
    !files.length ||
    files.length > 3 ||
    files.some((file) => !memberMediaTypes.has(file.type) || file.size > memberMediaMaxBytes)
  ) {
    redirect("/profile/edit?mediaError=gallery-files");
  }
  if (totalBytes > 15 * 1024 * 1024) redirect("/profile/edit?mediaError=gallery-files");
  const existing = await getPrismaClient().memberMedia.count({
    where: { userId: member.id, communityPostId: null },
  });
  if (existing + files.length > 12) redirect("/profile/edit?mediaError=gallery-limit");
  const uploaded: Array<{ objectKey: string; contentType: string; sizeBytes: number }> = [];
  try {
    for (const file of files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!mediaMatchesSignature(file.type, bytes)) throw new Error("Invalid media file");
      const objectKey = `member-media/${member.id}/profile/${randomUUID()}`;
      await uploadPrivateR2Object(objectKey, Buffer.from(bytes), file.type);
      uploaded.push({ objectKey, contentType: file.type, sizeBytes: file.size });
    }
    await getPrismaClient().memberMedia.createMany({
      data: uploaded.map((item) => ({ userId: member.id, ...item })),
    });
  } catch {
    await Promise.all(
      uploaded.map(({ objectKey }) => deletePrivateR2Object(objectKey).catch(() => {})),
    );
    redirect("/profile/edit?mediaError=storage");
  }
  revalidatePath("/profile/edit");
  revalidatePath(`/profiles/${member.id}`);
  redirect("/profile/edit?mediaSaved=1");
}

export async function removeMemberGalleryItem(data: FormData): Promise<void> {
  const member = await requireMember();
  const id = text(data, "mediaId");
  const item = await getPrismaClient().memberMedia.findFirst({
    where: { id, userId: member.id, communityPostId: null },
    select: { id: true, objectKey: true },
  });
  if (item) {
    await getPrismaClient().memberMedia.delete({ where: { id: item.id } });
    try {
      await deletePrivateR2Object(item.objectKey);
    } catch {
      /* The database no longer exposes this media. */
    }
  }
  revalidatePath("/profile/edit");
  revalidatePath(`/profiles/${member.id}`);
  redirect("/profile/edit?mediaSaved=1");
}

export async function saveSkillListing(_state: FormState, data: FormData): Promise<FormState> {
  try {
    const member = await requireMember();
    const id = text(data, "listingId");
    const name = text(data, "name");
    const categoryId = text(data, "categoryId");
    const direction = text(data, "direction") as SkillDirection;
    const level = text(data, "experienceLevel") as ExperienceLevel;
    const topics = text(data, "topics")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .slice(0, 12);
    const outcomes = text(data, "outcomes");
    const years = Number(text(data, "yearsExperience") || 0);
    const priceValue = text(data, "priceCredits");
    const price = priceValue ? Number(priceValue) : null;
    if (name.length < 2 || name.length > 100)
      return { error: "Skill name must be between 2 and 100 characters." };
    if (!directions.includes(direction) || !levels.includes(level))
      return { error: "Choose a valid direction and experience level." };
    if (!Number.isInteger(years) || years < 0 || years > 80)
      return { error: "Years of experience must be from 0 to 80." };
    if (outcomes.length > 500 || topics.some((topic) => topic.length > 60))
      return { error: "Keep each topic under 60 characters and the outcome under 500." };
    if (
      direction === "TEACH" &&
      price !== null &&
      (!Number.isInteger(price) || price < 0 || price > 1000)
    )
      return { error: "Credit cost must be from 0 to 1,000." };
    const prisma = getPrismaClient();
    const category = await prisma.skillCategory.findFirst({
      where: { id: categoryId, isActive: true },
      select: { id: true },
    });
    if (!category) return { error: "Choose an available skill category." };
    if (id) {
      const owned = await prisma.skillListing.findFirst({
        where: { id, userId: member.id },
        select: { id: true },
      });
      if (!owned) return { error: "That skill listing was not found." };
    }
    const normalizedName = name.replace(/\s+/g, " ");
    await prisma.skillListing.upsert({
      where: id
        ? { id }
        : { userId_direction_name: { userId: member.id, direction, name: normalizedName } },
      create: {
        userId: member.id,
        categoryId,
        direction,
        name: normalizedName,
        topics,
        outcomes: outcomes || null,
        experienceLevel: level,
        yearsExperience: years,
        priceCredits: direction === "TEACH" ? price : null,
      },
      update: {
        categoryId,
        direction,
        name: normalizedName,
        topics,
        outcomes: outcomes || null,
        experienceLevel: level,
        yearsExperience: years,
        priceCredits: direction === "TEACH" ? price : null,
      },
    });
    await syncLegacySkills(member.id);
    paths(member.id);
    return { success: "Skill listing saved." };
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002")
      return { error: "You already have a listing with that name and direction." };
    return failure(error);
  }
}

async function syncLegacySkills(userId: string) {
  const prisma = getPrismaClient();
  const listings = await prisma.skillListing.findMany({
    where: { userId, isActive: true },
    select: { direction: true, name: true },
  });
  await prisma.memberProfile.update({
    where: { userId },
    data: {
      teachSkills: listings.filter((item) => item.direction === "TEACH").map((item) => item.name),
      learnSkills: listings.filter((item) => item.direction === "LEARN").map((item) => item.name),
    },
  });
}

export async function deleteSkillListing(data: FormData): Promise<void> {
  const member = await requireMember();
  const id = text(data, "listingId");
  await getPrismaClient().skillListing.deleteMany({ where: { id, userId: member.id } });
  await syncLegacySkills(member.id);
  paths(member.id);
}

export async function requestSkillVerification(data: FormData): Promise<void> {
  const member = await requireMember();
  const id = text(data, "listingId");
  await getPrismaClient().skillListing.updateMany({
    where: { id, userId: member.id, verificationStatus: { not: "APPROVED" } },
    data: { verificationStatus: "PENDING", verificationRequestedAt: new Date() },
  });
  paths(member.id);
}

export async function hideProfileForThreeMonths(): Promise<void> {
  const member = await requireMember();
  const hiddenUntil = new Date();
  hiddenUntil.setMonth(hiddenUntil.getMonth() + 3);
  await getPrismaClient().memberProfile.update({
    where: { userId: member.id },
    data: { hiddenUntil, hideRestoreReminder: true },
  });
  paths(member.id);
}

export async function restoreProfileEarly(): Promise<void> {
  const member = await requireMember();
  await getPrismaClient().memberProfile.update({
    where: { userId: member.id },
    data: { hiddenUntil: null, privacyReviewRequired: true },
  });
  paths(member.id);
}

export async function requestProfileAccess(_state: FormState, data: FormData): Promise<FormState> {
  try {
    const requester = await requireMember();
    const ownerId = text(data, "ownerId");
    const reason = text(data, "reason");
    if (!ownerId || ownerId === requester.id || reason.length > 500)
      return { error: "Enter a short reason for this access request." };
    const prisma = getPrismaClient();
    const owner = await prisma.user.findFirst({
      where: {
        id: ownerId,
        status: "ACTIVE",
        memberProfile: {
          is: {
            isDiscoverable: true,
            profileVisibility: "PRIVATE",
            OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: new Date() } }],
          },
        },
      },
      select: { id: true, authUser: { select: { email: true } } },
    });
    if (!owner) return { error: "This profile is not accepting access requests." };
    const blocked = await prisma.profileBlock.findFirst({
      where: {
        OR: [
          { blockerId: requester.id, blockedUserId: ownerId },
          { blockerId: ownerId, blockedUserId: requester.id },
        ],
      },
      select: { id: true },
    });
    if (blocked) return { error: "You cannot request access to this profile." };
    const existing = await prisma.profileAccessRequest.findUnique({
      where: { requesterId_ownerId: { requesterId: requester.id, ownerId } },
      select: { status: true },
    });
    if (existing && ["PENDING", "APPROVED"].includes(existing.status))
      return {
        error:
          existing.status === "PENDING"
            ? "Your request is already waiting for a response."
            : "You already have access to this profile.",
      };
    await prisma.profileAccessRequest.upsert({
      where: { requesterId_ownerId: { requesterId: requester.id, ownerId } },
      create: { requesterId: requester.id, ownerId, reason: reason || null },
      update: { status: "PENDING", reason: reason || null, decidedAt: null },
    });
    await notifyProfileChange(
      owner.authUser?.email,
      "A member requested profile access",
      "A SkillSwap member has requested access to your private profile.",
    );
    paths(requester.id);
    revalidatePath(`/profiles/${ownerId}`);
    return { success: "Access request sent." };
  } catch (error) {
    return failure(error);
  }
}

export async function manageAccessRequest(data: FormData): Promise<void> {
  const member = await requireMember();
  const requestId = text(data, "requestId");
  const decision = text(data, "decision") as ProfileAccessStatus | "REVOKE" | "BLOCK";
  const prisma = getPrismaClient();
  const request = await prisma.profileAccessRequest.findFirst({
    where: { id: requestId, ownerId: member.id },
    select: {
      id: true,
      requesterId: true,
      ownerId: true,
      status: true,
      requester: { select: { authUser: { select: { email: true } } } },
    },
  });
  if (!request) return;
  if (
    (decision === "APPROVED" || decision === "DECLINED" || decision === "IGNORED") &&
    request.status === "PENDING"
  ) {
    await prisma.profileAccessRequest.update({
      where: { id: request.id },
      data: { status: decision, decidedAt: new Date() },
    });
    if (decision !== "IGNORED")
      await notifyProfileChange(
        request.requester.authUser?.email,
        `Private profile access ${decision.toLowerCase()}`,
        `Your request to view a member's private SkillSwap profile was ${decision.toLowerCase()}.`,
      );
  } else if (decision === "REVOKE" && request.status === "APPROVED") {
    await prisma.profileAccessRequest.update({
      where: { id: request.id },
      data: { status: "REVOKED", decidedAt: new Date() },
    });
    await notifyProfileChange(
      request.requester.authUser?.email,
      "Private profile access revoked",
      "A SkillSwap member has revoked your access to their private profile.",
    );
  } else if (decision === "BLOCK") {
    await prisma.$transaction((tx) => applyBlock(tx, member.id, request.requesterId));
  }
  paths(member.id);
  revalidatePath(`/profiles/${request.requesterId}`);
  revalidatePath("/connections");
  revalidatePath("/sessions");
  revalidatePath("/exchanges");
  revalidatePath("/requests");
  revalidatePath("/discover");
  revalidatePath("/saved");
}

export async function blockProfile(data: FormData): Promise<void> {
  const member = await requireMember();
  const blockedUserId = text(data, "userId");
  if (!blockedUserId || blockedUserId === member.id) return;
  const prisma = getPrismaClient();
  await prisma.$transaction((tx) => applyBlock(tx, member.id, blockedUserId));
  paths(member.id);
  revalidatePath(`/profiles/${blockedUserId}`);
  revalidatePath("/connections");
  revalidatePath("/sessions");
  revalidatePath("/exchanges");
  revalidatePath("/requests");
  revalidatePath("/discover");
  revalidatePath("/saved");
}

export async function unblockProfile(data: FormData): Promise<void> {
  const member = await requireMember();
  await getPrismaClient().profileBlock.deleteMany({
    where: { blockerId: member.id, blockedUserId: text(data, "userId") },
  });
  paths(member.id);
}
