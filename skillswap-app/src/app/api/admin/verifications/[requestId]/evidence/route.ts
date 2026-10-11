import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { signPrivateR2Url } from "@/lib/storage/r2";
import { writeAdminAuditEvent } from "@/lib/admin-audit";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const admin = await requireAdmin();
  const { requestId } = await params;
  const prisma = getPrismaClient();
  const verification = await prisma.verificationRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      userId: true,
      evidenceObjectKey: true,
      status: true,
      evidenceDeleteAt: true,
    },
  });
  if (
    !verification?.evidenceObjectKey ||
    verification.status === "DECLINED" ||
    (verification.evidenceDeleteAt && verification.evidenceDeleteAt <= new Date())
  )
    return new Response("Evidence is unavailable.", {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
  await writeAdminAuditEvent(prisma, {
    eventKey: "VERIFICATION_EVIDENCE_ACCESSED",
    actorId: admin.id,
    targetUserId: verification.userId,
    reason: "Admin requested time-limited access to private verification evidence.",
    details: { verificationId: verification.id },
  });
  try {
    return NextResponse.redirect(signPrivateR2Url("GET", verification.evidenceObjectKey, 60), {
      headers: { "cache-control": "private, no-store" },
    });
  } catch {
    return new Response("Private evidence storage is not configured.", {
      status: 503,
      headers: { "cache-control": "private, no-store" },
    });
  }
}
