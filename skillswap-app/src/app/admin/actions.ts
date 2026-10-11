"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import type { SafetyReportStatus } from "@/generated/prisma/client";
import type { SessionIncidentStatus } from "@/generated/prisma/client";
import { creditPostingEnabled } from "@/lib/credit-ledger";
import { writeAdminAuditEvent } from "@/lib/admin-audit";
import {
  resolveDirectSwapCredits,
  type DirectSwapResolutionOutcome,
} from "@/lib/direct-swap-ledger";

export async function updateSafetyReportStatus(data: FormData) {
  const admin = await requireAdmin();
  const reportId = String(data.get("reportId") ?? "");
  const status = String(data.get("status") ?? "") as SafetyReportStatus;
  if (!["IN_REVIEW", "RESOLVED", "DISMISSED"].includes(status)) return;
  const prisma = getPrismaClient();
  const report = await prisma.safetyReport.findUnique({
    where: { id: reportId },
    select: { id: true, reportedUserId: true, status: true },
  });
  if (!report || report.status === "RESOLVED" || report.status === "DISMISSED") return;
  await prisma.$transaction(async (tx) => {
    await tx.safetyReport.update({ where: { id: report.id }, data: { status } });
    await writeAdminAuditEvent(tx, {
      eventKey: "SAFETY_REPORT_" + status,
      actorId: admin.id,
      targetUserId: report.reportedUserId,
      reason: "Safety report queue status updated.",
      details: { reportId: report.id, fromStatus: report.status, toStatus: status },
    });
  });
  revalidatePath("/admin");
}

export async function reviewSessionIncident(data: FormData) {
  const admin = await requireAdmin();
  const incidentId = String(data.get("incidentId") ?? "");
  const status = String(data.get("status") ?? "") as SessionIncidentStatus;
  const adminNote =
    String(data.get("adminNote") ?? "")
      .trim()
      .slice(0, 1000) || null;
  if (!["IN_REVIEW", "ACCEPTED", "REJECTED"].includes(status)) return;
  const prisma = getPrismaClient();
  const incident = await prisma.sessionIncident.findUnique({
    where: { id: incidentId },
    select: {
      id: true,
      sessionId: true,
      reportedUserId: true,
      type: true,
      status: true,
      sessionStatusBeforeReport: true,
      session: {
        select: {
          learnerId: true,
          teacherId: true,
          exchangeRequest: {
            select: { type: true, directSwap: { select: { id: true, status: true } } },
          },
        },
      },
    },
  });
  if (!incident || ["ACCEPTED", "REJECTED"].includes(incident.status)) return;
  const final = status === "ACCEPTED" || status === "REJECTED";
  let directSwapStrikeCount: number | null = null;
  let directSwapSuspendedUntil: Date | null = null;
  let teacherStrikeCount: number | null = null;
  let teacherSuspendedUntil: Date | null = null;
  let bookingStrikeCount: number | null = null;
  let bookingRestrictedUntil: Date | null = null;
  const newSessionStatus =
    status === "ACCEPTED"
      ? incident.type === "NO_SHOW"
        ? "NO_SHOW"
        : "CANCELLED"
      : status === "REJECTED"
        ? incident.sessionStatusBeforeReport
        : null;
  await prisma.$transaction(async (tx) => {
    await tx.sessionIncident.update({
      where: { id: incident.id },
      data: {
        status,
        adminNote,
        ...(final ? { reviewedById: admin.id, reviewedAt: new Date() } : {}),
      },
    });
    if (newSessionStatus) {
      await tx.session.update({
        where: { id: incident.sessionId },
        data: { status: newSessionStatus as "NO_SHOW" | "CANCELLED" | "CONFIRMED" },
      });
      await tx.sessionEvent.create({
        data: {
          sessionId: incident.sessionId,
          actorId: admin.id,
          eventKey: "INCIDENT_REVIEWED",
          fromState: "DISPUTED",
          toState: newSessionStatus,
          summary: `Admin reviewed the ${incident.type.toLowerCase().replaceAll("_", " ")} report: ${status.toLowerCase()}.`,
        },
      });
    }
    const directSwap = incident.session.exchangeRequest.directSwap;
    const trustPolicy = await tx.trustPolicy.findUnique({ where: { id: "default" } });
    if (status === "ACCEPTED" && incident.type === "NO_SHOW" && directSwap) {
      await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE',
        incident.reportedUserId,
      );
      const profile = await tx.memberProfile.findUnique({
        where: { userId: incident.reportedUserId },
        select: { directSwapStrikeCount: true },
      });
      if (profile) {
        directSwapStrikeCount = profile.directSwapStrikeCount + 1;
        const threshold = trustPolicy?.directSwapStrikeThreshold ?? 3;
        const suspensionDays = trustPolicy?.directSwapSuspensionDays ?? 30;
        directSwapSuspendedUntil =
          directSwapStrikeCount >= threshold
            ? new Date(Date.now() + suspensionDays * 24 * 60 * 60 * 1000)
            : null;
        await tx.memberProfile.update({
          where: { userId: incident.reportedUserId },
          data: {
            directSwapStrikeCount: { increment: 1 },
            ...(directSwapSuspendedUntil ? { directSwapSuspendedUntil } : {}),
          },
        });
        await tx.directSwapEvent.create({
          data: {
            directSwapId: directSwap.id,
            actorId: admin.id,
            eventKey: "NO_SHOW_UPHELD",
            fromState: directSwap.status,
            toState: directSwap.status,
            summary: `Admin upheld a direct-swap no-show; strike ${directSwapStrikeCount} recorded.${directSwapSuspendedUntil ? ` Direct-swap access suspended for ${suspensionDays} days.` : ""}`,
            metadata: {
              incidentId: incident.id,
              reportedUserId: incident.reportedUserId,
              strikeCount: directSwapStrikeCount,
              directSwapSuspendedUntil: directSwapSuspendedUntil?.toISOString() ?? null,
            },
          },
        });
      }
    } else if (
      status === "ACCEPTED" &&
      incident.type === "NO_SHOW" &&
      incident.session.exchangeRequest.type === "CREDIT_LEARNING"
    ) {
      await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "User" WHERE "id" = $1 FOR UPDATE',
        incident.reportedUserId,
      );
      const profile = await tx.memberProfile.findUnique({
        where: { userId: incident.reportedUserId },
        select: { teacherStrikeCount: true, bookingStrikeCount: true },
      });
      if (profile && incident.reportedUserId === incident.session.teacherId) {
        teacherStrikeCount = profile.teacherStrikeCount + 1;
        const threshold = trustPolicy?.teacherStrikeThreshold ?? 3;
        const duration = trustPolicy?.teacherSuspensionDays ?? 30;
        teacherSuspendedUntil =
          teacherStrikeCount >= threshold
            ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
            : null;
        await tx.memberProfile.update({
          where: { userId: incident.reportedUserId },
          data: {
            teacherStrikeCount: { increment: 1 },
            ...(teacherSuspendedUntil ? { teachingSuspendedUntil: teacherSuspendedUntil } : {}),
          },
        });
      } else if (profile) {
        bookingStrikeCount = profile.bookingStrikeCount + 1;
        const threshold = trustPolicy?.bookingRestrictionThreshold ?? 5;
        const duration = trustPolicy?.bookingRestrictionDays ?? 7;
        bookingRestrictedUntil =
          bookingStrikeCount >= threshold
            ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
            : null;
        await tx.memberProfile.update({
          where: { userId: incident.reportedUserId },
          data: {
            bookingStrikeCount: { increment: 1 },
            ...(bookingRestrictedUntil ? { bookingRestrictedUntil } : {}),
          },
        });
      }
    }
    await writeAdminAuditEvent(tx, {
      eventKey: `SESSION_INCIDENT_${status}`,
      actorId: admin.id,
      targetUserId: incident.reportedUserId,
      reason: adminNote || "Session incident reviewed.",
      details: {
        incidentId: incident.id,
        sessionId: incident.sessionId,
        type: incident.type,
        fromStatus: incident.status,
        toStatus: status,
        directSwapStrikeCount,
        directSwapSuspendedUntil: directSwapSuspendedUntil?.toISOString() ?? null,
        teacherStrikeCount,
        teacherSuspendedUntil: teacherSuspendedUntil?.toISOString() ?? null,
        bookingStrikeCount,
        bookingRestrictedUntil: bookingRestrictedUntil?.toISOString() ?? null,
      },
    });
  });
  revalidatePath("/admin");
  revalidatePath(`/sessions/${incident.sessionId}`);
}

export async function resolveDirectSwap(data: FormData) {
  const admin = await requireAdmin();
  const directSwapId = String(data.get("directSwapId") ?? "").trim();
  const outcome = String(data.get("outcome") ?? "") as DirectSwapResolutionOutcome;
  const responsibleUserId = String(data.get("responsibleUserId") ?? "").trim();
  const reason = String(data.get("reason") ?? "")
    .trim()
    .slice(0, 1000);
  if (
    !directSwapId ||
    !["LATE_CANCEL_BEFORE_TAUGHT", "FAILURE_AFTER_TAUGHT", "EMERGENCY_COMPENSATION"].includes(
      outcome,
    )
  )
    return;
  if (reason.length < 15) return;
  if (!creditPostingEnabled()) return;
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const swap = await tx.directSwap.findUnique({
      where: { id: directSwapId },
      include: { exchangeRequest: { include: { sessions: { orderBy: { legNumber: "asc" } } } } },
    });
    if (!swap || swap.status !== "RESOLUTION_PENDING") return;
    const result = await resolveDirectSwapCredits(tx, {
      directSwapId: swap.id,
      actorId: admin.id,
      outcome,
      responsibleUserId: responsibleUserId || undefined,
      reason,
    });
    const now = new Date();
    for (const session of swap.exchangeRequest.sessions) {
      if (["PROPOSED", "CONFIRMED", "NO_SHOW_REPORTED", "DISPUTED"].includes(session.status)) {
        await tx.session.update({
          where: { id: session.id },
          data: { status: "CANCELLED", cancellationReason: reason },
        });
        await tx.sessionTimeProposal.updateMany({
          where: { sessionId: session.id, status: "PENDING" },
          data: { status: "WITHDRAWN", respondedAt: now },
        });
        await tx.sessionReminder.deleteMany({ where: { sessionId: session.id, sentAt: null } });
        await tx.sessionEvent.create({
          data: {
            sessionId: session.id,
            actorId: admin.id,
            eventKey: "DIRECT_SWAP_RESOLVED",
            fromState: session.status,
            toState: "CANCELLED",
            summary: "Admin finalized the direct-swap outcome; this session is closed.",
          },
        });
      }
    }
    await tx.directSwap.update({
      where: { id: swap.id },
      data: {
        status: result.status,
        resolutionOutcome: outcome,
        resolutionReason: reason,
        resolvedById: admin.id,
        resolvedAt: now,
      },
    });
    await tx.directSwapEvent.create({
      data: {
        directSwapId: swap.id,
        actorId: admin.id,
        eventKey: "ADMIN_RESOLUTION",
        fromState: swap.status,
        toState: result.status,
        summary: reason,
        metadata: {
          outcome,
          responsibleUserId: result.responsibleUserId,
          awardedCredits: result.amount,
          policyVersion: process.env.SKILLSWAP_CREDIT_POLICY_APPROVED_VERSION ?? null,
        },
      },
    });
    await writeAdminAuditEvent(tx, {
      eventKey: "DIRECT_SWAP_RESOLVED",
      actorId: admin.id,
      targetUserId: result.responsibleUserId,
      reason,
      details: {
        directSwapId: swap.id,
        beforeStatus: swap.status,
        afterStatus: result.status,
        outcome,
        resultingStatus: result.status,
        awardedCredits: result.amount,
      },
    });
  });
  revalidatePath("/admin");
  revalidatePath("/sessions");
  revalidatePath("/wallet");
}
