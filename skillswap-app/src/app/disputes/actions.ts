"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";

export async function openSessionDispute(data: FormData) {
  const member = await requireMember();
  const sessionId = String(data.get("sessionId") ?? "").trim();
  const details = String(data.get("details") ?? "")
    .trim()
    .slice(0, 2000);
  if (!sessionId || details.length < 30)
    throw new Error("Explain what happened in at least 30 characters.");
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const session = await tx.session.findFirst({
      where: { id: sessionId, OR: [{ learnerId: member.id }, { teacherId: member.id }] },
      include: { exchangeRequest: { select: { type: true } }, creditHold: true },
    });
    if (!session || session.exchangeRequest.type !== "CREDIT_LEARNING")
      throw new Error("Direct swaps use the Admin direct-swap review queue.");
    if (!["CONFIRMED", "COMPLETED"].includes(session.status))
      throw new Error("You can open a dispute for a confirmed or completed session.");
    if (session.creditHold?.status === "FROZEN")
      throw new Error("This session already has a frozen credit hold.");
    const otherUserId = member.id === session.learnerId ? session.teacherId : session.learnerId;
    const dispute = await tx.sessionDispute.create({
      data: { sessionId, openedById: member.id, otherUserId, details },
      select: { id: true },
    });
    if (session.creditHold?.status === "ACTIVE")
      await tx.creditHold.update({
        where: { id: session.creditHold.id },
        data: { status: "FROZEN" },
      });
    await tx.session.update({ where: { id: sessionId }, data: { status: "DISPUTED" } });
    await tx.sessionEvent.create({
      data: {
        sessionId,
        actorId: member.id,
        eventKey: "DISPUTE_OPENED",
        fromState: session.status,
        toState: "DISPUTED",
        summary:
          "A Member opened a private session dispute; the session is paused for Admin review.",
      },
    });
    await tx.securityAuditEvent.create({
      data: {
        eventKey: "SESSION_DISPUTE_OPENED",
        actorId: member.id,
        targetUserId: otherUserId,
        reason: "A private dispute was opened; relevant held credits were frozen.",
        details: { disputeId: dispute.id, sessionId },
      },
    });
  });
  revalidatePath("/disputes");
  revalidatePath(`/sessions/${sessionId}`);
}

export async function fileDisputeAppeal(data: FormData) {
  const member = await requireMember();
  const disputeId = String(data.get("disputeId") ?? "").trim();
  const details = String(data.get("details") ?? "")
    .trim()
    .slice(0, 1500);
  if (!disputeId || details.length < 30)
    throw new Error("Explain the appeal in at least 30 characters.");
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const dispute = await tx.sessionDispute.findUnique({
      where: { id: disputeId },
      select: { id: true, status: true, openedById: true, otherUserId: true, resolvedAt: true },
    });
    if (!dispute || ![dispute.openedById, dispute.otherUserId].includes(member.id))
      throw new Error("This dispute is not available to your account.");
    if (
      dispute.status !== "RESOLVED" ||
      !dispute.resolvedAt ||
      Date.now() - dispute.resolvedAt.getTime() > 7 * 24 * 60 * 60 * 1000
    )
      throw new Error("One appeal may be filed within seven days of the Admin decision.");
    await tx.disputeAppeal.create({ data: { disputeId, filedById: member.id, details } });
    await tx.sessionDispute.update({ where: { id: disputeId }, data: { status: "APPEALED" } });
    await tx.securityAuditEvent.create({
      data: {
        eventKey: "SESSION_DISPUTE_APPEALED",
        actorId: member.id,
        reason: "A Member filed the one allowed appeal.",
        details: { disputeId },
      },
    });
  });
  revalidatePath("/disputes");
}
