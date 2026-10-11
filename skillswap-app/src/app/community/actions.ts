"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CommunityPostType, CommunityVisibility } from "@/generated/prisma/client";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { consumeRateLimit, InteractionError } from "@/lib/interaction-policy";
import { enqueueNotification } from "@/lib/notifications";

const field = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
const types: CommunityPostType[] = ["TIP", "PROJECT", "PROGRESS", "TUTORIAL"];
const visibilities: CommunityVisibility[] = ["PUBLIC", "FOLLOWERS"];

async function visiblePost(postId: string, memberId: string) {
  if (!postId || postId.length > 40) throw new InteractionError("This post is unavailable.");
  const prisma = getPrismaClient();
  const post = await prisma.communityPost.findFirst({
    where: {
      id: postId,
      status: "PUBLISHED",
      author: {
        status: "ACTIVE",
        adminGrant: null,
        memberProfile: {
          is: {
            isDiscoverable: true,
            profileVisibility: "PUBLIC",
            OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: new Date() } }],
          },
        },
        NOT: [
          { blocksCreated: { some: { blockedUserId: memberId } } },
          { blocksReceived: { some: { blockerId: memberId } } },
          { mutedMembers: { some: { mutedUserId: memberId } } },
          { mutedByMembers: { some: { userId: memberId } } },
        ],
      },
    },
    select: { id: true, authorId: true, visibility: true },
  });
  if (!post) throw new InteractionError("This post is unavailable.");
  if (post.visibility === "FOLLOWERS" && post.authorId !== memberId) {
    const follows = await prisma.followedPerson.findUnique({
      where: { userId_personId: { userId: memberId, personId: post.authorId } },
      select: { userId: true },
    });
    if (!follows) throw new InteractionError("Follow this Member to view their post.");
  }
  return post;
}

export async function createCommunityPost(data: FormData) {
  const member = await requireMember();
  const type = field(data, "type") as CommunityPostType;
  const visibility = field(data, "visibility") as CommunityVisibility;
  const title = field(data, "title");
  const body = field(data, "body");
  const skillTags = [
    ...new Set(
      field(data, "skillTags")
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 5);
  if (
    !types.includes(type) ||
    !visibilities.includes(visibility) ||
    title.length < 3 ||
    title.length > 120 ||
    body.length < 20 ||
    body.length > 2000 ||
    skillTags.some((tag) => tag.length > 40)
  ) {
    redirect("/community?error=Check+the+post+type%2C+title%2C+body%2C+and+skill+tags.");
  }
  try {
    await consumeRateLimit(member.id, "community-post", 5, 24 * 60 * 60 * 1000);
  } catch (error) {
    if (error instanceof InteractionError) redirect("/community?error=post_limit");
    throw error;
  }
  const prisma = getPrismaClient();
  const post = await prisma.communityPost.create({
    data: { authorId: member.id, type, visibility, title, body, skillTags },
    select: { id: true },
  });
  const followers = await prisma.followedPerson.findMany({
    where: { personId: member.id, user: { is: { status: "ACTIVE", adminGrant: null } } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { userId: true },
  });
  await Promise.all(
    followers.map(({ userId }) =>
      enqueueNotification({
        recipientId: userId,
        actorId: member.id,
        category: "COMMUNITY",
        eventKey: "FOLLOWED_MEMBER_POST",
        idempotencyKey: `community-post:${post.id}:follower:${userId}`,
        title: "A Member you follow shared a learning post",
        body: `${member.profile?.displayName || "A Member"}: ${title}`,
        href: `/community#${post.id}`,
      }),
    ),
  );
  revalidatePath("/community");
  redirect("/community?posted=1");
}

export async function toggleCommunityReaction(data: FormData) {
  const member = await requireMember();
  const post = await visiblePost(field(data, "postId"), member.id);
  const prisma = getPrismaClient();
  const where = { postId_userId: { postId: post.id, userId: member.id } };
  const existing = await prisma.communityPostReaction.findUnique({ where });
  if (existing) await prisma.communityPostReaction.delete({ where });
  else await prisma.communityPostReaction.create({ data: { postId: post.id, userId: member.id } });
  revalidatePath("/community");
}

export async function toggleCommunitySave(data: FormData) {
  const member = await requireMember();
  const post = await visiblePost(field(data, "postId"), member.id);
  const prisma = getPrismaClient();
  const where = { postId_userId: { postId: post.id, userId: member.id } };
  if (await prisma.communityPostSave.findUnique({ where }))
    await prisma.communityPostSave.delete({ where });
  else await prisma.communityPostSave.create({ data: { postId: post.id, userId: member.id } });
  revalidatePath("/community");
}

export async function commentOnCommunityPost(data: FormData) {
  const member = await requireMember();
  const post = await visiblePost(field(data, "postId"), member.id);
  const body = field(data, "body");
  if (body.length < 1 || body.length > 1000)
    throw new InteractionError("Comments must be 1 to 1,000 characters.");
  await consumeRateLimit(member.id, "community-comment", 20, 60 * 60 * 1000);
  const comment = await getPrismaClient().communityPostComment.create({
    data: { postId: post.id, userId: member.id, body },
    select: { id: true },
  });
  if (post.authorId !== member.id) {
    const name = member.profile?.displayName || "A Member";
    await enqueueNotification({
      recipientId: post.authorId,
      actorId: member.id,
      category: "COMMUNITY",
      eventKey: "POST_COMMENT",
      idempotencyKey: `community-comment:${comment.id}:${post.authorId}`,
      title: "New comment on your learning post",
      body: `${name} commented: ${body.slice(0, 320)}`,
      href: `/community#${post.id}`,
    });
  }
  revalidatePath("/community");
}

export async function reportCommunityPost(data: FormData) {
  const member = await requireMember();
  const post = await visiblePost(field(data, "postId"), member.id);
  const category = field(data, "category");
  const details = field(data, "details");
  if (
    !["SPAM", "ABUSE", "MISLEADING", "OTHER"].includes(category) ||
    details.length < 10 ||
    details.length > 1000
  ) {
    throw new InteractionError("Choose a report reason and add at least 10 characters of context.");
  }
  await getPrismaClient().communityContentReport.upsert({
    where: { postId_reporterId: { postId: post.id, reporterId: member.id } },
    create: { postId: post.id, reporterId: member.id, category, details },
    update: { category, details, status: "OPEN", reviewedAt: null, reviewedById: null },
  });
  revalidatePath("/community");
  revalidatePath("/admin/community");
}

export async function muteCommunityAuthor(data: FormData) {
  const member = await requireMember();
  const post = await visiblePost(field(data, "postId"), member.id);
  if (post.authorId === member.id) return;
  await getPrismaClient().mutedMember.upsert({
    where: { userId_mutedUserId: { userId: member.id, mutedUserId: post.authorId } },
    create: { userId: member.id, mutedUserId: post.authorId },
    update: {},
  });
  revalidatePath("/community");
  revalidatePath("/notifications");
}

export async function unmuteCommunityMember(data: FormData) {
  const member = await requireMember();
  const mutedUserId = field(data, "mutedUserId");
  if (!mutedUserId || mutedUserId === member.id || mutedUserId.length > 40) return;
  await getPrismaClient().mutedMember.deleteMany({ where: { userId: member.id, mutedUserId } });
  revalidatePath("/community");
  revalidatePath("/community/muted");
}
