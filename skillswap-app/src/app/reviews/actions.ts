"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";

export async function submitSessionReview(data: FormData) {
  const member = await requireMember();
  const sessionId = String(data.get("sessionId") ?? "").trim();
  const rating = Number(data.get("rating"));
  const publicFeedback = String(data.get("publicFeedback") ?? "").trim();
  const privateFeedback = String(data.get("privateFeedback") ?? "").trim();
  if (!sessionId || !Number.isInteger(rating) || rating < 1 || rating > 5) return;
  if (publicFeedback.length > 700 || privateFeedback.length > 1200) return;

  const prisma = getPrismaClient();
  const revieweeId = await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      include: {
        exchangeRequest: { select: { type: true, directSwap: { select: { status: true } } } },
      },
    });
    if (!session || session.status !== "COMPLETED")
      throw new Error("Only completed sessions can be reviewed.");
    const isLearner = member.id === session.learnerId;
    if (!isLearner && member.id !== session.teacherId)
      throw new Error("You did not participate in this session.");
    if (session.exchangeRequest.type === "DIRECT_SWAP") {
      const legs = await tx.session.findMany({
        where: { exchangeRequestId: session.exchangeRequestId },
        select: { status: true },
      });
      if (legs.length !== 2 || legs.some((leg) => leg.status !== "COMPLETED"))
        throw new Error("Reviews open after both direct-swap sessions are complete.");
    }
    const reviewee = isLearner ? session.teacherId : session.learnerId;
    await tx.review.create({
      data: {
        sessionId,
        reviewerId: member.id,
        revieweeId: reviewee,
        rating,
        publicFeedback: publicFeedback || null,
        privateFeedback: privateFeedback || null,
      },
    });
    await tx.securityAuditEvent.create({
      data: {
        eventKey: "SESSION_REVIEW_SUBMITTED",
        actorId: member.id,
        targetUserId: reviewee,
        reason: "A member submitted post-session feedback.",
        details: { sessionId, rating, includesPrivateFeedback: Boolean(privateFeedback) },
      },
    });
    return reviewee;
  });
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/profiles/${revieweeId}`);
}
