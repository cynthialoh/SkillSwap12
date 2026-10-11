"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";

async function reviewReport(data: FormData, hidePost: boolean) {
  const admin = await requireAdmin();
  const reportId = String(data.get("reportId") ?? "").trim();
  if (!reportId || reportId.length > 40) return;
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const report = await tx.communityContentReport.findFirst({
      where: { id: reportId, status: "OPEN" },
      select: { id: true, postId: true, reporterId: true },
    });
    if (!report) return;
    await tx.communityContentReport.update({
      where: { id: report.id },
      data: {
        status: hidePost ? "REVIEWED" : "DISMISSED",
        reviewedById: admin.id,
        reviewedAt: new Date(),
      },
    });
    if (hidePost)
      await tx.communityPost.update({ where: { id: report.postId }, data: { status: "HIDDEN" } });
    await tx.securityAuditEvent.create({
      data: {
        eventKey: hidePost ? "COMMUNITY_POST_HIDDEN" : "COMMUNITY_REPORT_DISMISSED",
        actorId: admin.id,
        reason: hidePost
          ? "Post hidden after content report review."
          : "Content report reviewed and dismissed.",
        details: { reportId: report.id, postId: report.postId, reporterId: report.reporterId },
      },
    });
  });
  revalidatePath("/admin/community");
  revalidatePath("/community");
}

export async function hideReportedCommunityPost(data: FormData) {
  return reviewReport(data, true);
}

export async function dismissCommunityReport(data: FormData) {
  return reviewReport(data, false);
}
