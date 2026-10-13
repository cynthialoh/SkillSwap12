import "server-only";
import type { Prisma, ProfileAccessStatus } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";

const listingSelect = {
  id: true,
  direction: true,
  name: true,
  category: { select: { name: true } },
  topics: true,
  outcomes: true,
  experienceLevel: true,
  yearsExperience: true,
  priceCredits: true,
  verificationStatus: true,
} satisfies Prisma.SkillListingSelect;

type Listing = Prisma.SkillListingGetPayload<{ select: typeof listingSelect }>;
type BasicSkill = { id: string; direction: "TEACH" | "LEARN"; name: string };
type DetailedSkill = BasicSkill & {
  category: string;
  topics: string[];
  outcome: string | null;
  experienceLevel: string;
  yearsExperience: number;
  priceCredits: number | null;
  verificationStatus: string;
};
type ProfileBase = {
  userId: string;
  displayName: string;
  joinedYear: number;
  skills: BasicSkill[];
};

export type PrivateProfilePreviewDTO = ProfileBase & {
  kind: "private-preview";
  accessRequestStatus: ProfileAccessStatus | null;
  canRequestAccess: boolean;
};

export type PublicProfileDTO = ProfileBase & {
  kind: "public";
  about: string | null;
  location: string | null;
  teachSkills: DetailedSkill[];
  learnSkills: DetailedSkill[];
};

export type ApprovedPrivateProfileDTO = ProfileBase & {
  kind: "approved-private";
  about: string | null;
  location: string | null;
  availability: string | null;
  teachSkills: DetailedSkill[];
  learnSkills: DetailedSkill[];
};

export type ProfileViewDTO =
  | PrivateProfilePreviewDTO
  | PublicProfileDTO
  | ApprovedPrivateProfileDTO;

export type MemberSelfProfileDTO = {
  displayName: string | null;
  profileImageObjectKey: string | null;
  bio: string | null;
  location: string | null;
  timezone: string;
  profileVisibility: "PUBLIC" | "PRIVATE";
  isDiscoverable: boolean;
  acceptLearningRequests: boolean;
  acceptDirectSwapRequests: boolean;
  acceptMessages: boolean;
  hiddenUntil: Date | null;
  privacyReviewRequired: boolean;
  skills: Array<{
    id: string;
    direction: "TEACH" | "LEARN";
    name: string;
    categoryId: string;
    category: string;
    topics: string[];
    outcomes: string | null;
    experienceLevel: string;
    yearsExperience: number;
    priceCredits: number | null;
    verificationStatus: string;
  }>;
};

export async function getSelfProfileForMember(
  userId: string,
): Promise<MemberSelfProfileDTO | null> {
  const prisma = getPrismaClient();
  const member = await prisma.user.findFirst({
    where: { id: userId, status: "ACTIVE" },
    select: {
      memberProfile: {
        select: {
          displayName: true,
          profileImageObjectKey: true,
          bio: true,
          location: true,
          timezone: true,
          profileVisibility: true,
          isDiscoverable: true,
          acceptLearningRequests: true,
          acceptDirectSwapRequests: true,
          acceptMessages: true,
          hiddenUntil: true,
          privacyReviewRequired: true,
        },
      },
      skillListings: {
        where: { isActive: true },
        select: {
          id: true,
          direction: true,
          name: true,
          categoryId: true,
          category: { select: { name: true } },
          topics: true,
          outcomes: true,
          experienceLevel: true,
          yearsExperience: true,
          priceCredits: true,
          verificationStatus: true,
        },
        orderBy: [{ direction: "asc" }, { name: "asc" }],
      },
    },
  });
  if (!member?.memberProfile) return null;
  const selfHideExpired = Boolean(
    member.memberProfile.hiddenUntil && member.memberProfile.hiddenUntil <= new Date(),
  );
  if (selfHideExpired) {
    await prisma.memberProfile.update({
      where: { userId },
      data: { hiddenUntil: null, privacyReviewRequired: true },
    });
  }
  return {
    ...member.memberProfile,
    hiddenUntil: selfHideExpired ? null : member.memberProfile.hiddenUntil,
    privacyReviewRequired: member.memberProfile.privacyReviewRequired || selfHideExpired,
    skills: member.skillListings.map(({ category, ...skill }) => ({
      ...skill,
      category: category.name,
    })),
  };
}

function basicSkill(listing: Listing): BasicSkill {
  return { id: listing.id, direction: listing.direction, name: listing.name };
}

function detailedSkill(listing: Listing): DetailedSkill {
  return {
    ...basicSkill(listing),
    category: listing.category.name,
    topics: listing.topics,
    outcome: listing.outcomes,
    experienceLevel: listing.experienceLevel,
    yearsExperience: listing.yearsExperience,
    priceCredits: listing.direction === "TEACH" ? listing.priceCredits : null,
    verificationStatus: listing.verificationStatus,
  };
}

export async function getProfileViewForMember(
  viewerId: string,
  targetUserId: string,
): Promise<ProfileViewDTO | null> {
  if (viewerId === targetUserId) return null;
  const prisma = getPrismaClient();
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      status: true,
      createdAt: true,
      memberProfile: {
        select: {
          displayName: true,
          bio: true,
          location: true,
          availability: true,
          isDiscoverable: true,
          profileVisibility: true,
          hiddenUntil: true,
          privacyReviewRequired: true,
        },
      },
      skillListings: {
        where: { isActive: true },
        select: listingSelect,
        orderBy: [{ direction: "asc" }, { name: "asc" }],
      },
    },
  });

  if (!target || target.status !== "ACTIVE" || !target.memberProfile) return null;
  const profile = target.memberProfile;
  if (profile.hiddenUntil && profile.hiddenUntil > new Date()) return null;
  if (!profile.isDiscoverable) return null;

  const hidePeriodExpired = Boolean(profile.hiddenUntil && profile.hiddenUntil <= new Date());
  if (hidePeriodExpired) {
    await prisma.memberProfile.update({
      where: { userId: target.id },
      data: { hiddenUntil: null, privacyReviewRequired: true },
    });
  }

  const [block, accessRequest] = await Promise.all([
    prisma.profileBlock.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedUserId: target.id },
          { blockerId: target.id, blockedUserId: viewerId },
        ],
      },
      select: { id: true },
    }),
    prisma.profileAccessRequest.findUnique({
      where: { requesterId_ownerId: { requesterId: viewerId, ownerId: target.id } },
      select: { status: true },
    }),
  ]);
  if (block) return null;

  const displayName = profile.displayName?.trim() || "SkillSwap Member";
  const base: ProfileBase = {
    userId: target.id,
    displayName,
    joinedYear: target.createdAt.getUTCFullYear(),
    skills: target.skillListings.map(basicSkill),
  };
  const hasApprovedAccess = accessRequest?.status === "APPROVED";
  const requiresPrivacyReview = profile.privacyReviewRequired || hidePeriodExpired;

  if (profile.profileVisibility === "PUBLIC" && !requiresPrivacyReview) {
    return {
      ...base,
      kind: "public",
      about: profile.bio,
      location: profile.location,
      teachSkills: target.skillListings
        .filter((skill) => skill.direction === "TEACH")
        .map(detailedSkill),
      learnSkills: target.skillListings
        .filter((skill) => skill.direction === "LEARN")
        .map(detailedSkill),
    };
  }

  if (hasApprovedAccess && !requiresPrivacyReview) {
    const availability = profile.availability;
    const notes =
      availability && typeof availability === "object" && "notes" in availability
        ? String((availability as { notes?: unknown }).notes ?? "") || null
        : null;
    return {
      ...base,
      kind: "approved-private",
      about: profile.bio,
      location: profile.location,
      availability: notes,
      teachSkills: target.skillListings
        .filter((skill) => skill.direction === "TEACH")
        .map(detailedSkill),
      learnSkills: target.skillListings
        .filter((skill) => skill.direction === "LEARN")
        .map(detailedSkill),
    };
  }

  return {
    ...base,
    kind: "private-preview",
    accessRequestStatus: accessRequest?.status ?? null,
    canRequestAccess:
      !accessRequest ||
      ["DECLINED", "IGNORED", "REVOKED", "BLOCKED"].includes(accessRequest.status),
  };
}
