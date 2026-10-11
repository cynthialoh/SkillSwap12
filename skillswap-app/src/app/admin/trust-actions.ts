"use server";

import { revalidatePath } from "next/cache";
import type { DisputeOutcome, VerificationStatus, AppealStatus } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { applyDisputeCreditOutcome } from "@/lib/session-dispute-ledger";
import { writeAdminAuditEvent } from "@/lib/admin-audit";

const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export async function setVerificationReviewStatus(data: FormData) {
  const admin = await requireAdmin();
  const requestId = value(data, "requestId");
  const status = value(data, "status") as VerificationStatus;
  const reviewNote = value(data, "reviewNote").slice(0, 1000);
  if (!requestId || !["IN_REVIEW", "APPROVED", "DECLINED"].includes(status)) return;
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const request = await tx.verificationRequest.findUnique({ where: { id: requestId } });
    if (!request || ["APPROVED", "DECLINED"].includes(request.status)) return;
    const final = status === "APPROVED" || status === "DECLINED";
    const reviewedAt = final ? new Date() : null;
    await tx.verificationRequest.update({
      where: { id: request.id },
      data: {
        status,
        reviewNote: reviewNote || null,
        ...(final
          ? {
              reviewedById: admin.id,
              reviewedAt,
              evidenceDeleteAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            }
          : {}),
      },
    });
    if (request.kind === "IDENTITY" && final && status === "APPROVED")
      await tx.memberProfile.update({
        where: { userId: request.userId },
        data: { verifiedAt: reviewedAt },
      });
    if (request.kind === "SKILL" && request.skillListingId && final)
      await tx.skillListing.update({
        where: { id: request.skillListingId },
        data: { verificationStatus: status === "APPROVED" ? "APPROVED" : "DECLINED" },
      });
    await writeAdminAuditEvent(tx, {
      eventKey: `VERIFICATION_${status}`,
      actorId: admin.id,
      targetUserId: request.userId,
      reason: "Admin updated a private verification request.",
      details: {
        verificationRequestId: requestId,
        kind: request.kind,
        skillListingId: request.skillListingId,
        beforeStatus: request.status,
        status,
        evidenceRetentionScheduled: final && Boolean(request.evidenceObjectKey),
      },
    });
  });
  revalidatePath("/admin/trust");
  revalidatePath("/verifications");
  revalidatePath("/member");
}

export async function moderateReview(data: FormData) {
  const admin = await requireAdmin();
  const reviewId = value(data, "reviewId");
  const visible = value(data, "visible") === "true";
  const reason = value(data, "reason").slice(0, 700);
  if (!reviewId || reason.length < 15) return;
  const prisma = getPrismaClient();
  const revieweeId = await prisma.$transaction(async (tx) => {
    const before = await tx.review.findUnique({
      where: { id: reviewId },
      select: { revieweeId: true, reviewerId: true, rating: true, isPublicVisible: true },
    });
    if (!before) return null;
    await tx.review.update({
      where: { id: reviewId },
      data: { isPublicVisible: visible, moderatedById: admin.id, moderationNote: reason },
    });
    await writeAdminAuditEvent(tx, {
      eventKey: visible ? "REVIEW_RESTORED" : "REVIEW_HIDDEN",
      actorId: admin.id,
      targetUserId: before.revieweeId,
      reason,
      details: {
        reviewId,
        reviewerId: before.reviewerId,
        rating: before.rating,
        beforeVisible: before.isPublicVisible,
        afterVisible: visible,
      },
    });
    return before.revieweeId;
  });
  if (!revieweeId) return;
  revalidatePath("/admin/trust");
  revalidatePath(`/profiles/${revieweeId}`);
  revalidatePath("/reviews");
}

export async function markDisputeInReview(data: FormData) {
  const admin = await requireAdmin();
  const disputeId = value(data, "disputeId");
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const dispute = await tx.sessionDispute.findUnique({
      where: { id: disputeId },
      select: { id: true, status: true, openedById: true, otherUserId: true },
    });
    if (!dispute || dispute.status !== "OPEN") return;
    await tx.sessionDispute.update({ where: { id: dispute.id }, data: { status: "IN_REVIEW" } });
    await writeAdminAuditEvent(tx, {
      eventKey: "SESSION_DISPUTE_IN_REVIEW",
      actorId: admin.id,
      targetUserId: dispute.openedById,
      reason: "Admin started reviewing a private dispute.",
      details: {
        disputeId: dispute.id,
        otherUserId: dispute.otherUserId,
        beforeStatus: "OPEN",
        afterStatus: "IN_REVIEW",
      },
    });
  });
  revalidatePath("/admin/trust");
  revalidatePath("/disputes");
}

export async function resolveSessionDispute(data: FormData) {
  const admin = await requireAdmin();
  const disputeId = value(data, "disputeId");
  const outcome = value(data, "outcome") as DisputeOutcome;
  const decisionReason = value(data, "decisionReason").slice(0, 1200);
  const memberSummary = value(data, "memberSummary").slice(0, 600);
  if (
    !disputeId ||
    !["RETURN_TO_LEARNER", "PAY_TEACHER"].includes(outcome) ||
    decisionReason.length < 20 ||
    memberSummary.length < 20
  )
    return;
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const dispute = await tx.sessionDispute.findUnique({
      where: { id: disputeId },
      include: {
        session: { include: { exchangeRequest: { select: { type: true } }, creditHold: true } },
      },
    });
    if (!dispute || !["OPEN", "IN_REVIEW"].includes(dispute.status)) return;
    const hold = dispute.session.creditHold;
    if (hold?.status === "FROZEN") {
      await applyDisputeCreditOutcome(tx, {
        disputeId,
        sessionId: dispute.sessionId,
        actorId: admin.id,
        outcome,
        version: "decision",
      });
    } else if (hold && ["RELEASED", "SETTLED"].includes(hold.status) && hold.closeTransactionId) {
      await applyDisputeCreditOutcome(tx, {
        disputeId,
        sessionId: dispute.sessionId,
        actorId: admin.id,
        outcome,
        version: "decision",
        reverseTransactionId: hold.closeTransactionId,
      });
    }
    const now = new Date();
    await tx.sessionDispute.update({
      where: { id: disputeId },
      data: {
        status: "RESOLVED",
        outcome,
        decisionReason,
        memberSummary,
        resolvedById: admin.id,
        resolvedAt: now,
      },
    });
    await tx.session.update({
      where: { id: dispute.sessionId },
      data: {
        status: "CANCELLED",
        cancellationReason: "Closed by a private Admin dispute decision.",
      },
    });
    await tx.sessionEvent.create({
      data: {
        sessionId: dispute.sessionId,
        actorId: admin.id,
        eventKey: "DISPUTE_RESOLVED",
        fromState: "DISPUTED",
        toState: "CANCELLED",
        summary: "Admin closed the session following a private dispute decision.",
      },
    });
    await writeAdminAuditEvent(tx, {
      eventKey: "SESSION_DISPUTE_RESOLVED",
      actorId: admin.id,
      targetUserId: dispute.openedById,
      reason: decisionReason,
      details: {
        disputeId,
        otherUserId: dispute.otherUserId,
        beforeStatus: dispute.status,
        afterStatus: "RESOLVED",
        outcome,
        summary: memberSummary,
        ledgerAction: hold ? "POSTED" : "NO_HOLD",
      },
    });
  });
  revalidatePath("/admin/trust");
  revalidatePath("/disputes");
  revalidatePath("/wallet");
}

export async function decideDisputeAppeal(data: FormData) {
  const admin = await requireAdmin();
  const appealId = value(data, "appealId");
  const status = value(data, "status") as AppealStatus;
  const outcome = value(data, "outcome") as DisputeOutcome;
  const decisionReason = value(data, "decisionReason").slice(0, 1000);
  const memberSummary = value(data, "memberSummary").slice(0, 600);
  if (
    !appealId ||
    !["UPHELD", "OVERTURNED", "DISMISSED"].includes(status) ||
    decisionReason.length < 20 ||
    memberSummary.length < 20
  )
    return;
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const appeal = await tx.disputeAppeal.findUnique({
      where: { id: appealId },
      include: { dispute: { include: { session: { include: { creditHold: true } } } } },
    });
    if (!appeal || appeal.status !== "PENDING" || appeal.dispute.status !== "APPEALED") return;
    if (status === "OVERTURNED") {
      const hold = appeal.dispute.session.creditHold;
      if (hold?.closeTransactionId) {
        await applyDisputeCreditOutcome(tx, {
          disputeId: appeal.disputeId,
          sessionId: appeal.dispute.sessionId,
          actorId: admin.id,
          outcome,
          version: `appeal-${appeal.id}`,
          reverseTransactionId: hold.closeTransactionId,
        });
      }
    }
    const now = new Date();
    await tx.disputeAppeal.update({
      where: { id: appeal.id },
      data: { status, reviewedById: admin.id, decisionReason, reviewedAt: now },
    });
    await tx.sessionDispute.update({
      where: { id: appeal.disputeId },
      data: {
        status: "CLOSED",
        ...(status === "OVERTURNED" ? { outcome, decisionReason, memberSummary } : {}),
        resolvedById: admin.id,
        resolvedAt: now,
      },
    });
    await writeAdminAuditEvent(tx, {
      eventKey: `SESSION_DISPUTE_APPEAL_${status}`,
      actorId: admin.id,
      targetUserId: appeal.dispute.openedById,
      reason: decisionReason,
      details: {
        disputeId: appeal.disputeId,
        appealId,
        beforeStatus: appeal.dispute.status,
        afterStatus: "CLOSED",
        outcome: status === "OVERTURNED" ? outcome : appeal.dispute.outcome,
        memberSummary,
        ledgerReversed:
          status === "OVERTURNED" && Boolean(appeal.dispute.session.creditHold?.closeTransactionId),
      },
    });
  });
  revalidatePath("/admin/trust");
  revalidatePath("/disputes");
  revalidatePath("/wallet");
}

export async function updateTrustPolicy(data: FormData) {
  const admin = await requireAdmin();
  const fields = [
    ["level2CompletedExchanges", 1, 10000],
    ["level3CompletedExchanges", 2, 20000],
    ["level4CompletedExchanges", 3, 50000],
    ["directSwapStrikeThreshold", 1, 20],
    ["directSwapSuspensionDays", 1, 365],
    ["teacherStrikeThreshold", 1, 20],
    ["teacherSuspensionDays", 1, 365],
    ["bookingRestrictionThreshold", 1, 20],
    ["bookingRestrictionDays", 1, 365],
  ] as const;
  const values = Object.fromEntries(fields.map(([name]) => [name, Number(data.get(name))]));
  if (
    fields.some(
      ([name, min, max]) =>
        !Number.isInteger(values[name]) || values[name] < min || values[name] > max,
    )
  )
    return;
  if (
    !(
      values.level2CompletedExchanges < values.level3CompletedExchanges &&
      values.level3CompletedExchanges < values.level4CompletedExchanges
    )
  )
    return;
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const before = await tx.trustPolicy.findUnique({ where: { id: "default" } });
    const policy = await tx.trustPolicy.upsert({
      where: { id: "default" },
      create: { id: "default", ...values, updatedById: admin.id, updatedAt: new Date() },
      update: { ...values, updatedById: admin.id },
    });
    await writeAdminAuditEvent(tx, {
      eventKey: "TRUST_POLICY_UPDATED",
      actorId: admin.id,
      reason: "Admin updated trust thresholds and restriction durations.",
      details: {
        policyId: policy.id,
        before: before
          ? {
              level2CompletedExchanges: before.level2CompletedExchanges,
              level3CompletedExchanges: before.level3CompletedExchanges,
              level4CompletedExchanges: before.level4CompletedExchanges,
              directSwapStrikeThreshold: before.directSwapStrikeThreshold,
              directSwapSuspensionDays: before.directSwapSuspensionDays,
              teacherStrikeThreshold: before.teacherStrikeThreshold,
              teacherSuspensionDays: before.teacherSuspensionDays,
              bookingRestrictionThreshold: before.bookingRestrictionThreshold,
              bookingRestrictionDays: before.bookingRestrictionDays,
            }
          : null,
        after: values,
      },
    });
  });
  revalidatePath("/admin/trust");
}
