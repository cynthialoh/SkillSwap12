import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { submitSessionReview } from "@/app/reviews/actions";

export default async function SessionReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await requireMemberPage();
  const { id } = await params;
  const session = await getPrismaClient().session.findFirst({
    where: { id, OR: [{ learnerId: member.id }, { teacherId: member.id }] },
    include: {
      learner: { select: { id: true, memberProfile: { select: { displayName: true } } } },
      teacher: { select: { id: true, memberProfile: { select: { displayName: true } } } },
      exchangeRequest: {
        select: { title: true, type: true, sessions: { select: { status: true } } },
      },
      reviews: { where: { reviewerId: member.id }, select: { id: true } },
    },
  });
  if (!session) notFound();
  if (session.status !== "COMPLETED") redirect(`/sessions/${session.id}`);
  const partner = member.id === session.learnerId ? session.teacher : session.learner;
  const directSwapReady =
    session.exchangeRequest.type !== "DIRECT_SWAP" ||
    (session.exchangeRequest.sessions.length === 2 &&
      session.exchangeRequest.sessions.every((part) => part.status === "COMPLETED"));

  return (
    <main className="auth-page">
      <section className="auth-card member-card">
        <Link className="text-link" href={`/sessions/${session.id}`}>
          ← Back to session
        </Link>
        <p className="section-kicker">PRIVATE MEMBER FEEDBACK</p>
        <h1>Review your session</h1>
        <p className="auth-intro">
          {session.exchangeRequest.title} with{" "}
          {partner.memberProfile?.displayName || "your exchange partner"}.
        </p>
        {session.reviews.length ? (
          <p className="privacy-notice">
            You already submitted your optional review. Reviews can’t be edited after submission.
          </p>
        ) : !directSwapReady ? (
          <p className="privacy-notice">
            Both sessions in this direct swap must be complete before either participant can review.
          </p>
        ) : (
          <form action={submitSessionReview} className="interaction-form">
            <input type="hidden" name="sessionId" value={session.id} />
            <label>
              Rating
              <select name="rating" required defaultValue="5">
                <option value="5">5 · Excellent</option>
                <option value="4">4 · Good</option>
                <option value="3">3 · As expected</option>
                <option value="2">2 · Needs improvement</option>
                <option value="1">1 · Poor</option>
              </select>
            </label>
            <label>
              Public feedback (optional)
              <textarea
                name="publicFeedback"
                maxLength={700}
                rows={4}
                placeholder="Share useful feedback future learners can see."
              />
            </label>
            <label>
              Private feedback for SkillSwap (optional)
              <textarea
                name="privateFeedback"
                maxLength={1200}
                rows={4}
                placeholder="Only authorized Admins can read this."
              />
            </label>
            <p className="form-hint">
              A single rating does not automatically lower Trust Level or trigger a restriction.
              Report safety concerns through the safety report flow.
            </p>
            <button className="primary-button">Submit review</button>
          </form>
        )}
      </section>
    </main>
  );
}
