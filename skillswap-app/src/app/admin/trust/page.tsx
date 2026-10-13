import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getActor, requireAdmin } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { creditPostingEnabled } from "@/lib/credit-ledger";
import {
  decideDisputeAppeal,
  markDisputeInReview,
  moderateReview,
  resolveSessionDispute,
  setVerificationReviewStatus,
  updateTrustPolicy,
} from "../trust-actions";
import { AdminNavigation } from "../admin-shared";

export default async function AdminTrustPage() {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  if (!actor.isAdmin || actor.status !== "ACTIVE") notFound();
  await requireAdmin();
  const prisma = getPrismaClient();
  const [verifications, disputes, policy, reviews, trustEvents] = await Promise.all([
    prisma.verificationRequest.findMany({
      where: { status: { in: ["PENDING", "IN_REVIEW"] } },
      orderBy: { submittedAt: "asc" },
      take: 100,
      include: {
        user: { select: { memberProfile: { select: { displayName: true } } } },
        skillListing: { select: { name: true } },
      },
    }),
    prisma.sessionDispute.findMany({
      where: { status: { in: ["OPEN", "IN_REVIEW", "APPEALED"] } },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: {
        openedBy: { select: { memberProfile: { select: { displayName: true } } } },
        otherUser: { select: { memberProfile: { select: { displayName: true } } } },
        session: {
          select: {
            id: true,
            status: true,
            exchangeRequest: { select: { title: true } },
            creditHold: { select: { amount: true, status: true, closeTransactionId: true } },
          },
        },
        appeal: true,
      },
    }),
    prisma.trustPolicy.findUnique({ where: { id: "default" } }),
    prisma.review.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        reviewer: { select: { memberProfile: { select: { displayName: true } } } },
        reviewee: { select: { displayName: true } },
        session: { select: { exchangeRequest: { select: { title: true } } } },
      },
    }),
    prisma.trustLevelEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { displayName: true } },
        actor: { select: { memberProfile: { select: { displayName: true } } } },
      },
    }),
  ]);
  const defaults = {
    level2CompletedExchanges: 3,
    level3CompletedExchanges: 10,
    level4CompletedExchanges: 25,
    directSwapStrikeThreshold: 3,
    directSwapSuspensionDays: 30,
    teacherStrikeThreshold: 3,
    teacherSuspensionDays: 30,
    bookingRestrictionThreshold: 5,
    bookingRestrictionDays: 7,
  };
  const current = policy ?? defaults;
  return (
    <main className="interaction-page admin-trust-page">
      <Link className="text-link" href="/admin">
        ← Admin workspace
      </Link>
      <AdminNavigation current="/admin/trust" />
      <section className="interaction-panel">
        <p className="section-kicker">PRIVATE TRUST OPERATIONS</p>
        <h1>Trust, verification, disputes</h1>
        <p>
          Verification evidence and dispute narratives are private. Every review, decision, and
          evidence access is recorded in the Admin audit trail.
        </p>
        <h2>Verification requests</h2>
        {verifications.length ? (
          <ul className="audit-list">
            {verifications.map((item) => (
              <li key={item.id}>
                <strong>
                  {item.kind === "SKILL"
                    ? `Skill verification · ${item.skillListing?.name ?? "Listing removed"}`
                    : "Identity verification"}
                </strong>
                <p>
                  {item.user.memberProfile?.displayName || "Member"} · {item.statement}
                </p>
                <p>
                  Submitted {item.submittedAt.toLocaleString()} ·{" "}
                  {item.evidenceObjectKey
                    ? `${(item.evidenceSize! / 1024 / 1024).toFixed(1)} MB private evidence`
                    : "No evidence file"}
                </p>
                {item.evidenceObjectKey && (
                  <Link href={`/api/admin/verifications/${item.id}/evidence`}>
                    Open short-lived evidence link
                  </Link>
                )}
                <form action={setVerificationReviewStatus} className="interaction-form">
                  <input type="hidden" name="requestId" value={item.id} />
                  <label>
                    Private Admin review note
                    <textarea
                      name="reviewNote"
                      maxLength={1000}
                      rows={2}
                      defaultValue={item.reviewNote ?? ""}
                    />
                  </label>
                  <div className="report-review-actions">
                    <button name="status" value="IN_REVIEW" className="secondary-button">
                      Mark in review
                    </button>
                    <button name="status" value="APPROVED" className="primary-button">
                      Approve
                    </button>
                    <button name="status" value="DECLINED" className="text-button">
                      Decline
                    </button>
                  </div>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No verification requests are awaiting review.</p>
        )}

        <h2>Recent Member reviews</h2>
        {reviews.length ? (
          <ul className="audit-list">
            {reviews.map((review) => (
              <li key={review.id}>
                <strong>
                  {review.rating} / 5 · {review.session.exchangeRequest.title} ·{" "}
                  {review.reviewer.memberProfile?.displayName || "Member"} →{" "}
                  {review.reviewee.displayName || "Member"}
                </strong>
                <p>Public: {review.publicFeedback || "No public comment"}</p>
                {review.privateFeedback && (
                  <p>Private to Member and Admin: {review.privateFeedback}</p>
                )}
                <p>
                  Visibility: {review.isPublicVisible ? "Public" : "Hidden"}
                  {review.moderationNote ? ` · Admin note: ${review.moderationNote}` : ""}
                </p>
                <form action={moderateReview} className="interaction-form">
                  <input type="hidden" name="reviewId" value={review.id} />
                  <label>
                    Private moderation reason
                    <textarea name="reason" minLength={15} maxLength={700} rows={2} required />
                  </label>
                  <button
                    className="secondary-button"
                    name="visible"
                    value={review.isPublicVisible ? "false" : "true"}
                  >
                    {review.isPublicVisible ? "Hide public content" : "Restore public content"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No reviews have been submitted.</p>
        )}

        <h2>Session disputes and appeals</h2>
        {disputes.length ? (
          <ul className="audit-list">
            {disputes.map((dispute) => {
              const hasFrozenHold = dispute.session.creditHold?.status === "FROZEN";
              const needsLedger =
                hasFrozenHold || Boolean(dispute.session.creditHold?.closeTransactionId);
              return (
                <li key={dispute.id}>
                  <strong>
                    {dispute.session.exchangeRequest.title} · {dispute.status.toLowerCase()}
                  </strong>
                  <p>
                    Reported by {dispute.openedBy.memberProfile?.displayName || "Member"}; other
                    participant {dispute.otherUser.memberProfile?.displayName || "Member"}.
                  </p>
                  <p>Private report: {dispute.details}</p>
                  <p>
                    {dispute.session.creditHold
                      ? `${dispute.session.creditHold.amount} credits · hold ${dispute.session.creditHold.status.toLowerCase()}`
                      : "No session credit hold"}
                  </p>
                  {dispute.status === "OPEN" && (
                    <form action={markDisputeInReview}>
                      <input type="hidden" name="disputeId" value={dispute.id} />
                      <button className="secondary-button">Start review</button>
                    </form>
                  )}
                  {dispute.status === "OPEN" || dispute.status === "IN_REVIEW" ? (
                    <form action={resolveSessionDispute} className="interaction-form">
                      <input type="hidden" name="disputeId" value={dispute.id} />
                      <input type="hidden" name="sessionId" value={dispute.session.id} />
                      <label>
                        Credit outcome
                        <select name="outcome" required defaultValue="RETURN_TO_LEARNER">
                          <option value="RETURN_TO_LEARNER">Return held credits to learner</option>
                          <option value="PAY_TEACHER">Pay teacher from held credits</option>
                        </select>
                      </label>
                      <label>
                        Private Admin rationale
                        <textarea
                          name="decisionReason"
                          minLength={20}
                          maxLength={1200}
                          rows={3}
                          required
                        />
                      </label>
                      <label>
                        Member-facing summary
                        <textarea
                          name="memberSummary"
                          minLength={20}
                          maxLength={600}
                          rows={2}
                          required
                          placeholder="Share only the appropriate outcome explanation."
                        />
                      </label>
                      {!creditPostingEnabled() && needsLedger && (
                        <p className="privacy-notice">
                          Settlement is disabled by default until the approved Phase 1 policy is
                          explicitly enabled.
                        </p>
                      )}
                      <button
                        className="primary-button"
                        disabled={!creditPostingEnabled() && needsLedger}
                      >
                        Resolve dispute
                      </button>
                    </form>
                  ) : null}
                  {dispute.appeal && (
                    <div className="appeal-panel">
                      <h3>One appeal · {dispute.appeal.status.toLowerCase()}</h3>
                      <p>{dispute.appeal.details}</p>
                      {dispute.appeal.status === "PENDING" && (
                        <form action={decideDisputeAppeal} className="interaction-form">
                          <input type="hidden" name="appealId" value={dispute.appeal.id} />
                          <label>
                            Appeal decision
                            <select name="status" required defaultValue="UPHELD">
                              <option value="UPHELD">Uphold original decision</option>
                              <option value="OVERTURNED">Overturn with a new outcome</option>
                              <option value="DISMISSED">Dismiss appeal</option>
                            </select>
                          </label>
                          <label>
                            Final credit outcome for an overturned decision
                            <select name="outcome" defaultValue="RETURN_TO_LEARNER">
                              <option value="RETURN_TO_LEARNER">
                                Return held credits to learner
                              </option>
                              <option value="PAY_TEACHER">Pay teacher from held credits</option>
                            </select>
                          </label>
                          <label>
                            Private Admin rationale
                            <textarea
                              name="decisionReason"
                              minLength={20}
                              maxLength={1000}
                              rows={3}
                              required
                            />
                          </label>
                          <label>
                            Member-facing summary
                            <textarea
                              name="memberSummary"
                              minLength={20}
                              maxLength={600}
                              rows={2}
                              required
                            />
                          </label>
                          {!creditPostingEnabled() && needsLedger && (
                            <p className="privacy-notice">
                              Credit reversal and finalization are disabled until the Phase 1 credit
                              policy is approved.
                            </p>
                          )}
                          <button
                            className="primary-button"
                            disabled={!creditPostingEnabled() && needsLedger}
                          >
                            Record final appeal decision
                          </button>
                        </form>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-state">No open disputes or appeals.</p>
        )}

        <h2>Trust and restriction policy</h2>
        <p>
          Trust levels rise only with completed exchanges. Ratings do not trigger penalties. Adjust
          thresholds here; each reviewed no-show decision uses the current rule.
        </p>
        <form action={updateTrustPolicy} className="interaction-form policy-grid">
          {(
            [
              "level2CompletedExchanges",
              "level3CompletedExchanges",
              "level4CompletedExchanges",
              "directSwapStrikeThreshold",
              "directSwapSuspensionDays",
              "teacherStrikeThreshold",
              "teacherSuspensionDays",
              "bookingRestrictionThreshold",
              "bookingRestrictionDays",
            ] as const
          ).map((name) => (
            <label key={name}>
              {name
                .replaceAll(/([A-Z])/g, " $1")
                .replaceAll("Exchanges", " completed exchanges")
                .trim()}
              <input
                type="number"
                name={name}
                required
                min="1"
                max={name.includes("Days") ? "365" : "50000"}
                defaultValue={current[name]}
              />
            </label>
          ))}
          <button className="secondary-button">Save trust policy</button>
        </form>
        <h2>Trust Level history</h2>
        {trustEvents.length ? (
          <ul className="audit-list">
            {trustEvents.map((event) => (
              <li key={event.id}>
                <strong>
                  {event.user.displayName || "Member"} · Level {event.fromLevel} → {event.toLevel}
                </strong>
                <p>
                  {event.reason} · {event.reasonCode.replaceAll("_", " ")}
                </p>
                <time dateTime={event.createdAt.toISOString()}>
                  {event.createdAt.toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No Trust Level changes have been recorded.</p>
        )}
      </section>
    </main>
  );
}
