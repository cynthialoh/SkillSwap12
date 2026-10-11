import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function MyReviewsPage() {
  const member = await requireMemberPage();
  const prisma = getPrismaClient();
  const [sessions, written, received] = await Promise.all([
    prisma.session.findMany({
      where: { status: "COMPLETED", OR: [{ learnerId: member.id }, { teacherId: member.id }] },
      orderBy: { completedAt: "desc" },
      take: 30,
      include: {
        exchangeRequest: {
          select: { title: true, type: true, sessions: { select: { status: true } } },
        },
        reviews: { where: { reviewerId: member.id }, select: { id: true } },
      },
    }),
    prisma.review.findMany({
      where: { reviewerId: member.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        rating: true,
        publicFeedback: true,
        privateFeedback: true,
        createdAt: true,
        session: { select: { exchangeRequest: { select: { title: true } } } },
        reviewee: { select: { displayName: true } },
      },
    }),
    prisma.review.findMany({
      where: { revieweeId: member.id, isPublicVisible: true, publicFeedback: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        rating: true,
        publicFeedback: true,
        createdAt: true,
        session: { select: { exchangeRequest: { select: { title: true } } } },
        reviewer: { select: { memberProfile: { select: { displayName: true } } } },
      },
    }),
  ]);
  return (
    <main className="interaction-page">
      <Link className="text-link" href="/member">
        ← Member workspace
      </Link>
      <section className="interaction-panel">
        <p className="section-kicker">YOUR FEEDBACK</p>
        <h1>Reviews</h1>
        <h2>Completed sessions</h2>
        {sessions.length ? (
          <ul className="audit-list">
            {sessions.map((session) => (
              <li key={session.id}>
                <strong>{session.exchangeRequest.title}</strong>
                {session.reviews.length ? (
                  <span>Review submitted</span>
                ) : session.exchangeRequest.type === "DIRECT_SWAP" &&
                  session.exchangeRequest.sessions.some((part) => part.status !== "COMPLETED") ? (
                  <span>Waiting for both swap sessions to complete</span>
                ) : (
                  <Link href={`/sessions/${session.id}/review`}>Leave an optional review</Link>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">Reviews become available after a session is completed.</p>
        )}
        <h2>Feedback you received</h2>
        {received.length ? (
          <ul className="review-list">
            {received.map((review) => (
              <li key={review.id}>
                <strong>
                  {review.rating} / 5 · {review.session.exchangeRequest.title}
                </strong>
                <p>{review.publicFeedback}</p>
                <span>
                  {review.reviewer.memberProfile?.displayName || "SkillSwap Member"} ·{" "}
                  {review.createdAt.toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No public written feedback yet.</p>
        )}
        <h2>Feedback you submitted</h2>
        {written.length ? (
          <ul className="review-list">
            {written.map((review) => (
              <li key={review.id}>
                <strong>
                  {review.rating} / 5 · {review.session.exchangeRequest.title} · for{" "}
                  {review.reviewee.displayName || "Member"}
                </strong>
                {review.publicFeedback && <p>Public: {review.publicFeedback}</p>}
                {review.privateFeedback && (
                  <p className="privacy-notice">
                    Private to you and authorized Admins: {review.privateFeedback}
                  </p>
                )}
                <span>{review.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">You have not submitted a review.</p>
        )}
      </section>
    </main>
  );
}
