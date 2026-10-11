"use server";

import { revalidatePath } from "next/cache";
import type { AdminQueuePriority, Prisma, UserStatus } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { writeAdminAuditEvent } from "@/lib/admin-audit";

const field = (data: FormData, name: string) => String(data.get(name) ?? "").trim();

export async function setUserAccountStatus(data: FormData) {
  const actor = await requireAdmin();
  const userId = field(data, "userId");
  const status = field(data, "status") as UserStatus;
  const reason = field(data, "reason").slice(0, 500);
  if (
    !userId ||
    userId === actor.id ||
    !["ACTIVE", "RESTRICTED", "SUSPENDED"].includes(status) ||
    reason.length < 20
  )
    return;
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        authUserId: true,
        status: true,
        adminGrant: { select: { userId: true } },
      },
    });
    if (!user || user.adminGrant || user.status === "DELETION_PENDING" || user.status === status)
      return;
    await tx.user.update({ where: { id: user.id }, data: { status } });
    if (status !== "ACTIVE" && user.authUserId)
      await tx.authSession.deleteMany({ where: { userId: user.authUserId } });
    await writeAdminAuditEvent(tx, {
      eventKey: "ADMIN_USER_STATUS_CHANGED",
      actorId: actor.id,
      targetUserId: user.id,
      reason,
      details: { before: user.status, after: status },
    });
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin/metrics");
}

export async function revokeAdminGrant(data: FormData) {
  const actor = await requireAdmin();
  const userId = field(data, "userId");
  const reason = field(data, "reason").slice(0, 500);
  if (!userId || reason.length < 20) return;
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const target = await tx.adminGrant.findUnique({
      where: { userId },
      include: { user: { select: { status: true, authUserId: true } } },
    });
    if (!target) return;
    const otherActiveAdmins = await tx.adminGrant.count({
      where: { userId: { not: userId }, user: { status: "ACTIVE" } },
    });
    if (otherActiveAdmins < 1)
      throw new Error("At least one other active Admin must remain before revoking this grant.");
    await tx.adminGrant.delete({ where: { userId } });
    if (target.user.authUserId)
      await tx.authSession.deleteMany({ where: { userId: target.user.authUserId } });
    await writeAdminAuditEvent(tx, {
      eventKey: "ADMIN_GRANT_REVOKED",
      actorId: actor.id,
      targetUserId: userId,
      reason,
      details: { before: "ADMIN", after: "MEMBER", targetStatus: target.user.status },
    });
  });
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function createSkillCategory(data: FormData) {
  const actor = await requireAdmin();
  const name = field(data, "name").replace(/\s+/g, " ").slice(0, 80);
  const reason = field(data, "reason").slice(0, 500);
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  if (name.length < 2 || !slug || reason.length < 20) return;
  const prisma = getPrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      const category = await tx.skillCategory.create({ data: { name, slug } });
      await writeAdminAuditEvent(tx, {
        eventKey: "SKILL_CATEGORY_CREATED",
        actorId: actor.id,
        reason,
        details: { categoryId: category.id, name: category.name, slug },
      });
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return;
    throw error;
  }
  revalidatePath("/admin/catalog");
  revalidatePath("/discover");
}

export async function setSkillCategoryActive(data: FormData) {
  const actor = await requireAdmin();
  const categoryId = field(data, "categoryId");
  const activeText = field(data, "active");
  const reason = field(data, "reason").slice(0, 500);
  if (!categoryId || !["true", "false"].includes(activeText) || reason.length < 20) return;
  const active = activeText === "true";
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const category = await tx.skillCategory.findUnique({
      where: { id: categoryId },
      select: { id: true, name: true, isActive: true },
    });
    if (!category || category.isActive === active) return;
    await tx.skillCategory.update({ where: { id: categoryId }, data: { isActive: active } });
    await writeAdminAuditEvent(tx, {
      eventKey: "SKILL_CATEGORY_STATUS_CHANGED",
      actorId: actor.id,
      reason,
      details: { categoryId, name: category.name, before: category.isActive, after: active },
    });
  });
  revalidatePath("/admin/catalog");
  revalidatePath("/discover");
}

type QueueItemType =
  | "SAFETY_REPORT"
  | "SESSION_INCIDENT"
  | "DISPUTE"
  | "VERIFICATION"
  | "DIRECT_SWAP";

async function getQueueConflictUsers(
  tx: Prisma.TransactionClient,
  itemType: QueueItemType,
  itemId: string,
) {
  if (itemType === "SAFETY_REPORT") {
    const item = await tx.safetyReport.findUnique({
      where: { id: itemId },
      select: { reporterId: true, reportedUserId: true, status: true },
    });
    return item && ["OPEN", "IN_REVIEW"].includes(item.status)
      ? [item.reporterId, item.reportedUserId]
      : null;
  }
  if (itemType === "SESSION_INCIDENT") {
    const item = await tx.sessionIncident.findUnique({
      where: { id: itemId },
      select: { reporterId: true, reportedUserId: true, status: true },
    });
    return item && ["OPEN", "IN_REVIEW"].includes(item.status)
      ? [item.reporterId, item.reportedUserId]
      : null;
  }
  if (itemType === "DISPUTE") {
    const item = await tx.sessionDispute.findUnique({
      where: { id: itemId },
      select: { openedById: true, otherUserId: true, status: true },
    });
    return item && ["OPEN", "IN_REVIEW", "APPEALED"].includes(item.status)
      ? [item.openedById, item.otherUserId]
      : null;
  }
  if (itemType === "VERIFICATION") {
    const item = await tx.verificationRequest.findUnique({
      where: { id: itemId },
      select: { userId: true, reviewedById: true, status: true },
    });
    return item && ["PENDING", "IN_REVIEW"].includes(item.status)
      ? [item.userId, ...(item.reviewedById ? [item.reviewedById] : [])]
      : null;
  }
  const item = await tx.directSwap.findUnique({
    where: { id: itemId },
    select: { requesterId: true, recipientId: true, status: true },
  });
  return item && ["MUTUAL_CANCELLATION_PENDING", "RESOLUTION_PENDING"].includes(item.status)
    ? [item.requesterId, item.recipientId]
    : null;
}

export async function assignAdminQueueItem(data: FormData) {
  const actor = await requireAdmin();
  const itemType = field(data, "itemType") as QueueItemType;
  const itemId = field(data, "itemId");
  const assigneeId = field(data, "assigneeId") || null;
  const priority = field(data, "priority") as AdminQueuePriority;
  const reason = field(data, "reason").slice(0, 500);
  if (
    !["SAFETY_REPORT", "SESSION_INCIDENT", "DISPUTE", "VERIFICATION", "DIRECT_SWAP"].includes(
      itemType,
    ) ||
    !itemId ||
    !["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority) ||
    reason.length < 15
  )
    return;
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const conflictUsers = await getQueueConflictUsers(tx, itemType, itemId);
    if (!conflictUsers) return;
    if (assigneeId) {
      const assignee = await tx.user.findUnique({
        where: { id: assigneeId },
        select: { id: true, status: true, adminGrant: { select: { userId: true } } },
      });
      if (
        !assignee ||
        !assignee.adminGrant ||
        assignee.status !== "ACTIVE" ||
        conflictUsers.includes(assignee.id)
      )
        throw new Error("Choose an active Admin who is not involved in this case.");
    }
    const before = await tx.adminQueueAssignment.findUnique({
      where: { itemType_itemId: { itemType, itemId } },
    });
    const after = await tx.adminQueueAssignment.upsert({
      where: { itemType_itemId: { itemType, itemId } },
      create: { itemType, itemId, priority, assigneeId, updatedById: actor.id, reason },
      update: { priority, assigneeId, updatedById: actor.id, reason },
    });
    await writeAdminAuditEvent(tx, {
      eventKey: "ADMIN_QUEUE_ASSIGNMENT_CHANGED",
      actorId: actor.id,
      reason,
      details: {
        itemType,
        itemId,
        before: before ? { assigneeId: before.assigneeId, priority: before.priority } : null,
        after: { assigneeId: after.assigneeId, priority: after.priority },
      },
    });
  });
  revalidatePath("/admin/queues");
  revalidatePath("/admin");
}
