import "server-only";
import type { ExperienceLevel, Prisma, SkillDirection } from "@/generated/prisma/client";
import { getPrismaClient } from "@/lib/db/prisma";

export type DiscoveryInput = {
  q?: string;
  category?: string;
  direction?: "TEACH" | "LEARN" | "";
  level?: ExperienceLevel | "";
  verified?: boolean;
  recent?: boolean;
  availability?: boolean;
  sort?: "recommended" | "recent" | "name";
  page?: number;
};
export type DiscoveryCard = {
  id: string;
  name: string;
  joinedYear: number;
  kind: "public" | "preview";
  bio: string | null;
  location: string | null;
  trustLevel: number;
  recentlyActive: boolean;
  availabilityListed: boolean;
  skills: Array<{
    id: string;
    name: string;
    direction: SkillDirection;
    category: string;
    level: ExperienceLevel;
    topics: string[];
    price: number | null;
    verified: boolean;
    saved: boolean;
    followed: boolean;
  }>;
  reason: string;
  saved: boolean;
  followed: boolean;
};
export function cleanDiscoveryInput(
  params: Record<string, string | string[] | undefined>,
): DiscoveryInput {
  const first = (key: string) =>
    (Array.isArray(params[key]) ? params[key]?.[0] : params[key]) ?? "";
  const level = first("level");
  return {
    q: first("q").trim().slice(0, 100),
    category: first("category").trim().slice(0, 80),
    direction:
      first("direction") === "TEACH" || first("direction") === "LEARN"
        ? (first("direction") as "TEACH" | "LEARN")
        : "",
    level: ["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"].includes(level)
      ? (level as ExperienceLevel)
      : "",
    verified: first("verified") === "on",
    recent: first("recent") === "on",
    availability: first("availability") === "on",
    sort: ["recommended", "recent", "name"].includes(first("sort"))
      ? (first("sort") as "recommended" | "recent" | "name")
      : "recommended",
    page: Math.max(1, Math.min(1000, Number(first("page")) || 1)),
  };
}

export async function getDiscoveryData(viewerId: string, input: DiscoveryInput) {
  const prisma = getPrismaClient();
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 86400000);
  const preferences = await prisma.discoveryPreference.upsert({
    where: { userId: viewerId },
    create: { userId: viewerId },
    update: {},
  });
  const [blocks, mutes] = await Promise.all([
    prisma.profileBlock.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedUserId: viewerId }] },
      select: { blockerId: true, blockedUserId: true },
    }),
    prisma.mutedMember.findMany({
      where: { OR: [{ userId: viewerId }, { mutedUserId: viewerId }] },
      select: { userId: true, mutedUserId: true },
    }),
  ]);
  const excluded = [
    ...blocks.map((b) => (b.blockerId === viewerId ? b.blockedUserId : b.blockerId)),
    ...mutes.map((m) => (m.userId === viewerId ? m.mutedUserId : m.userId)),
  ];
  const skillWhere: Prisma.SkillListingWhereInput = {
    isActive: true,
    ...(input.direction ? { direction: input.direction } : {}),
    ...(input.level ? { experienceLevel: input.level } : {}),
    ...(input.verified ? { verificationStatus: "APPROVED" } : {}),
    ...(input.category ? { category: { slug: input.category } } : {}),
    ...(input.q
      ? {
          OR: [
            { name: { contains: input.q, mode: "insensitive" } },
            { topics: { has: input.q } },
            { outcomes: { contains: input.q, mode: "insensitive" } },
            { category: { name: { contains: input.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const candidateWhere: Prisma.UserWhereInput = {
    id: { not: viewerId, notIn: excluded },
    status: "ACTIVE",
    adminGrant: null,
    authUser: { is: { emailVerified: true } },
    memberProfile: {
      is: {
        onboardingCompletedAt: { not: null },
        isDiscoverable: true,
        trustLevel: { gte: preferences.minimumTrustLevel },
        OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: now } }],
      },
    },
    skillListings: { some: skillWhere },
  };
  const [
    users,
    total,
    categories,
    savedRows,
    followedRows,
    savedSkillRows,
    followedSkillRows,
    dismissedRows,
    viewer,
  ] = await Promise.all([
    prisma.user.findMany({
      where: candidateWhere,
      take: 500,
      select: {
        id: true,
        createdAt: true,
        memberProfile: {
          select: {
            displayName: true,
            bio: true,
            location: true,
            profileVisibility: true,
            privacyReviewRequired: true,
            hiddenUntil: true,
            trustLevel: true,
            learnSkills: true,
            availability: true,
          },
        },
        authUser: {
          select: {
            sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
          },
        },
        skillListings: {
          where: { isActive: true },
          orderBy: [{ direction: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            direction: true,
            experienceLevel: true,
            topics: true,
            priceCredits: true,
            verificationStatus: true,
            category: { select: { name: true } },
          },
        },
      },
    }),
    prisma.user.count({ where: candidateWhere }),
    prisma.skillCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { name: true, slug: true },
    }),
    prisma.savedTeacher.findMany({ where: { userId: viewerId }, select: { teacherId: true } }),
    prisma.followedPerson.findMany({ where: { userId: viewerId }, select: { personId: true } }),
    prisma.savedSkill.findMany({ where: { userId: viewerId }, select: { skillListingId: true } }),
    prisma.followedSkill.findMany({
      where: { userId: viewerId },
      select: { skillListingId: true },
    }),
    prisma.dismissedRecommendation.findMany({
      where: { userId: viewerId },
      select: { targetId: true },
    }),
    prisma.user.findUnique({
      where: { id: viewerId },
      select: {
        memberProfile: { select: { teachSkills: true, learnSkills: true } },
        skillListings: { where: { isActive: true }, select: { name: true, direction: true } },
      },
    }),
  ]);
  const saved = new Set(savedRows.map((r) => r.teacherId));
  const followed = new Set(followedRows.map((r) => r.personId));
  const savedSkills = new Set(savedSkillRows.map((r) => r.skillListingId));
  const followedSkills = new Set(followedSkillRows.map((r) => r.skillListingId));
  const dismissed = new Set(dismissedRows.map((r) => r.targetId));
  const teach = new Set(
    [
      ...(viewer?.memberProfile?.teachSkills ?? []),
      ...(viewer?.skillListings.filter((s) => s.direction === "TEACH").map((s) => s.name) ?? []),
    ].map((s) => s.toLowerCase()),
  );
  const learn = new Set(
    [
      ...(viewer?.memberProfile?.learnSkills ?? []),
      ...(viewer?.skillListings.filter((s) => s.direction === "LEARN").map((s) => s.name) ?? []),
    ].map((s) => s.toLowerCase()),
  );
  const cards = users
    .filter((u) => !dismissed.has(u.id))
    .map((u) => {
      const p = u.memberProfile!;
      const preview =
        p.profileVisibility === "PRIVATE" ||
        p.privacyReviewRequired ||
        Boolean(p.hiddenUntil && p.hiddenUntil <= now);
      const skills = u.skillListings.map((s) => ({
        id: s.id,
        name: s.name,
        direction: s.direction,
        category: preview ? "Skill" : s.category.name,
        level: s.experienceLevel,
        topics: preview ? [] : s.topics,
        price: !preview && s.direction === "TEACH" ? s.priceCredits : null,
        verified: !preview && s.verificationStatus === "APPROVED",
        saved: savedSkills.has(s.id),
        followed: followedSkills.has(s.id),
      }));
      const teachesWant = skills.some(
        (s) => s.direction === "TEACH" && learn.has(s.name.toLowerCase()),
      );
      const learnsCan = skills.some(
        (s) => s.direction === "LEARN" && teach.has(s.name.toLowerCase()),
      );
      const interests = (p.learnSkills ?? []).some((s) => teach.has(s.toLowerCase()));
      const recent = Boolean(u.authUser?.sessions[0] && u.authUser.sessions[0].updatedAt >= cutoff);
      const hasVerified = skills.some((s) => s.verified);
      const personalized = preferences.personalizationMode === "ACTIVE";
      const score =
        (teachesWant ? 8 : 0) +
        (learnsCan ? 5 : 0) +
        (interests ? 3 : 0) +
        (personalized && hasVerified ? 1 : 0) +
        (personalized && preferences.useTrustLevel ? Math.min(p.trustLevel, 5) * 0.2 : 0);
      const reason = teachesWant
        ? "Teaches a skill you want to learn"
        : learnsCan
          ? "Wants to learn something you teach"
          : interests
            ? "Their learning interests match your skills"
            : hasVerified
              ? "Has a verified skill listing"
              : "Shares skills you’re exploring";
      return {
        id: u.id,
        name: p.displayName?.trim() || "SkillSwap Member",
        joinedYear: u.createdAt.getUTCFullYear(),
        kind: preview ? ("preview" as const) : ("public" as const),
        bio: preview ? null : p.bio,
        location: preview ? null : p.location,
        trustLevel: p.trustLevel,
        recentlyActive: recent,
        skills,
        reason,
        saved: saved.has(u.id),
        followed: followed.has(u.id),
        availabilityListed: !preview && Boolean(p.availability),
        score,
      };
    })
    .filter(
      (c) => (!input.recent || c.recentlyActive) && (!input.availability || c.availabilityListed),
    );
  if (input.sort === "recent")
    cards.sort((a, b) => b.joinedYear - a.joinedYear || a.name.localeCompare(b.name));
  else if (input.sort === "name") cards.sort((a, b) => a.name.localeCompare(b.name));
  else cards.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const pageSize = 12;
  const count = input.recent || input.availability ? cards.length : Math.min(total, 500);
  return {
    cards: cards.slice(((input.page ?? 1) - 1) * pageSize, (input.page ?? 1) * pageSize),
    total: count,
    pages: Math.max(1, Math.ceil(count / pageSize)),
    categories,
    preferences,
  };
}

export async function getDirectSwapCandidates(viewerId: string) {
  const prisma = getPrismaClient();
  const [me, preference, blocks, mutes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewerId },
      select: {
        skillListings: { where: { isActive: true }, select: { name: true, direction: true } },
      },
    }),
    prisma.discoveryPreference.findUnique({ where: { userId: viewerId } }),
    prisma.profileBlock.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedUserId: viewerId }] },
      select: { blockerId: true, blockedUserId: true },
    }),
    prisma.mutedMember.findMany({
      where: { OR: [{ userId: viewerId }, { mutedUserId: viewerId }] },
      select: { userId: true, mutedUserId: true },
    }),
  ]);
  const teaches = new Set(
    me?.skillListings.filter((s) => s.direction === "TEACH").map((s) => s.name.toLowerCase()),
  );
  const learns = new Set(
    me?.skillListings.filter((s) => s.direction === "LEARN").map((s) => s.name.toLowerCase()),
  );
  const excluded = [
    viewerId,
    ...blocks.map((b) => (b.blockerId === viewerId ? b.blockedUserId : b.blockerId)),
    ...mutes.map((m) => (m.userId === viewerId ? m.mutedUserId : m.userId)),
  ];
  const users = await prisma.user.findMany({
    where: {
      id: { notIn: excluded },
      status: "ACTIVE",
      adminGrant: null,
      authUser: { is: { emailVerified: true } },
      memberProfile: {
        is: {
          onboardingCompletedAt: { not: null },
          isDiscoverable: true,
          acceptDirectSwapRequests: true,
          trustLevel: { gte: preference?.minimumDirectSwapTrust ?? 1 },
          OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: new Date() } }],
        },
      },
      skillListings: { some: { isActive: true, direction: "TEACH" } },
    },
    take: 300,
    select: {
      id: true,
      memberProfile: {
        select: {
          displayName: true,
          profileVisibility: true,
          privacyReviewRequired: true,
          trustLevel: true,
          hiddenUntil: true,
        },
      },
      skillListings: {
        where: { isActive: true },
        select: { id: true, name: true, direction: true },
      },
    },
  });
  return users.flatMap((u) => {
    const teachesSkill = u.skillListings.find(
      (s) => s.direction === "TEACH" && learns.has(s.name.toLowerCase()),
    );
    const learnsSkill = u.skillListings.find(
      (s) => s.direction === "LEARN" && teaches.has(s.name.toLowerCase()),
    );
    if (!teachesSkill || !learnsSkill) return [];
    const p = u.memberProfile!;
    const preview =
      p.profileVisibility === "PRIVATE" ||
      p.privacyReviewRequired ||
      Boolean(p.hiddenUntil && p.hiddenUntil <= new Date());
    return [
      {
        id: u.id,
        name: p.displayName?.trim() || "SkillSwap Member",
        trustLevel: p.trustLevel,
        preview,
        teaches: { id: teachesSkill.id, name: teachesSkill.name },
        learns: { id: learnsSkill.id, name: learnsSkill.name },
        reason: "They teach " + teachesSkill.name + " and want to learn " + learnsSkill.name + ".",
      },
    ];
  });
}
