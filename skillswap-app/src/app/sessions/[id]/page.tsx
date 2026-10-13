import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { decryptMeetingLink, formatSessionTime } from "@/lib/sessions";
import { creditPostingEnabled } from "@/lib/credit-ledger";
import {
  cancelSession,
  confirmDirectSwapCancellation,
  markSessionComplete,
  proposeReschedule,
  reportSessionIncident,
  respondToTimeProposal,
  saveMeetingLink,
  updateReminderPreference,
  withdrawTimeProposal,
} from "../actions";

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const member = await requireMemberPage();
  const { id } = await params;
  const [session, query] = await Promise.all([
    getPrismaClient().session.findFirst({
      where: { id, OR: [{ learnerId: member.id }, { teacherId: member.id }] },
      include: {
        learner: {
          select: { id: true, memberProfile: { select: { displayName: true, timezone: true } } },
        },
        teacher: {
          select: { id: true, memberProfile: { select: { displayName: true, timezone: true } } },
        },
        exchangeRequest: {
          select: {
            title: true,
            type: true,
            targetSkillName: true,
            offerSkillName: true,
            directSwap: {
              select: {
                id: true,
                status: true,
                requesterId: true,
                recipientId: true,
                targetSkillValueCredits: true,
                offerSkillValueCredits: true,
                requesterDepositCredits: true,
                recipientDepositCredits: true,
                cancellationRequestedById: true,
                cancellationRequestedAt: true,
                cancellationReason: true,
              },
            },
            sessions: {
              orderBy: { legNumber: "asc" },
              select: {
                id: true,
                legNumber: true,
                status: true,
                startsAt: true,
                priceCredits: true,
                creditHold: { select: { amount: true, status: true } },
              },
            },
          },
        },
        creditHold: { select: { amount: true, status: true } },
        dispute: { select: { id: true } },
        proposals: {
          include: {
            proposer: { select: { id: true, memberProfile: { select: { displayName: true } } } },
          },
          orderBy: { createdAt: "desc" },
        },
        events: {
          include: { actor: { select: { memberProfile: { select: { displayName: true } } } } },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    searchParams,
  ]);
  if (!session) notFound();
  const timezone = member.profile?.timezone || "UTC";
  const other = member.id === session.learnerId ? session.teacher : session.learner;
  const pending = session.proposals.find((proposal) => proposal.status === "PENDING");
  const canCancel = ["PROPOSED", "CONFIRMED"].includes(session.status);
  let meetingLink: string | null = null;
  if (session.status === "CONFIRMED" && session.meetingLinkEncrypted) {
    try {
      meetingLink = decryptMeetingLink(session.meetingLinkEncrypted);
    } catch {
      meetingLink = null;
    }
  }
  const reminderOn =
    member.id === session.learnerId ? session.learnerReminderOn : session.teacherReminderOn;
  const reminderMinutes =
    member.id === session.learnerId ? session.learnerReminderMins : session.teacherReminderMins;
  const markedComplete =
    member.id === session.learnerId ? session.learnerCompletedAt : session.teacherCompletedAt;
  const skillName =
    session.legNumber === 1
      ? session.exchangeRequest.targetSkillName
      : session.exchangeRequest.offerSkillName;
  return (
    <main className="interaction-page">
      <Link className="text-link" href="/sessions">
        ← All sessions
      </Link>
      <header className="interaction-header session-detail-header">
        <div>
          <p className="section-kicker">
            SESSION DETAILS
            {session.exchangeRequest.type === "DIRECT_SWAP"
              ? ` · SESSION ${session.legNumber} OF 2`
              : ""}
          </p>
          <h1>{skillName}</h1>
          <p>
            {session.exchangeRequest.title} ·{" "}
            {session.exchangeRequest.type === "DIRECT_SWAP"
              ? "Direct swap"
              : "Credit-based learning"}
          </p>
        </div>
        <span className="status-pill">{session.status.toLowerCase().replaceAll("_", " ")}</span>
      </header>
      {query.notice && <p className="success-notice">{query.notice}</p>}
      {query.error && <p className="error-notice">{query.error}</p>}
      {session.exchangeRequest.type === "DIRECT_SWAP" && session.exchangeRequest.directSwap && (
        <section className="interaction-panel">
          <h2>Direct swap · two session agreement</h2>
          <p>
            Status: {session.exchangeRequest.directSwap.status.toLowerCase().replaceAll("_", " ")}
            {" · "}deposit quotes: requester{" "}
            {session.exchangeRequest.directSwap.requesterDepositCredits} credits, recipient{" "}
            {session.exchangeRequest.directSwap.recipientDepositCredits} credits.
          </p>
          <p>
            Deposits use the quoted skill values:{" "}
            {session.exchangeRequest.directSwap.targetSkillValueCredits} credits for{" "}
            {session.exchangeRequest.targetSkillName} and{" "}
            {session.exchangeRequest.directSwap.offerSkillValueCredits} credits for{" "}
            {session.exchangeRequest.offerSkillName}. The half-value rounding proposal is ceiling,
            minimum 1 credit. Credit movement remains disabled by default until the approved policy
            is explicitly enabled.
          </p>
          <ol className="activity-list">
            {session.exchangeRequest.sessions.map((part) => (
              <li key={part.id}>
                <strong>Session {part.legNumber}:</strong>{" "}
                {part.legNumber === 1
                  ? session.exchangeRequest.targetSkillName
                  : session.exchangeRequest.offerSkillName}{" "}
                · {part.status.toLowerCase().replaceAll("_", " ")}
                {part.startsAt
                  ? ` · ${formatSessionTime(part.startsAt, timezone)}`
                  : " · time not confirmed"}
                {part.creditHold
                  ? ` · ${part.creditHold.amount} credits ${part.creditHold.status.toLowerCase()}`
                  : " · deposit not held"}
                {part.id !== id && (
                  <>
                    {" "}
                    · <Link href={`/sessions/${part.id}`}>Open session</Link>
                  </>
                )}
              </li>
            ))}
          </ol>
          {session.exchangeRequest.directSwap.status === "MUTUAL_CANCELLATION_PENDING" &&
            session.exchangeRequest.directSwap.cancellationRequestedById !== member.id && (
              <div>
                <p>
                  Your partner requested a mutual cancellation
                  {session.exchangeRequest.directSwap.cancellationReason
                    ? `: ${session.exchangeRequest.directSwap.cancellationReason}`
                    : "."}{" "}
                  Both deposits are returned only after both members confirm.
                </p>
                <form action={confirmDirectSwapCancellation}>
                  <input type="hidden" name="sessionId" value={id} />
                  <button className="danger-button">Confirm mutual cancellation</button>
                </form>
              </div>
            )}
        </section>
      )}
      <section className="interaction-panel session-detail-grid">
        <div>
          <h2>People</h2>
          <p>
            <strong>Learner:</strong>{" "}
            {session.learner.memberProfile?.displayName || "SkillSwap Member"}
          </p>
          <p>
            <strong>Teacher:</strong>{" "}
            {session.teacher.memberProfile?.displayName || "SkillSwap Member"}
          </p>
          <Link className="secondary-button" href={`/profiles/${other.id}`}>
            View {other.memberProfile?.displayName || "member"}’s profile
          </Link>
        </div>
        <div>
          <h2>Schedule</h2>
          {session.startsAt ? (
            <>
              <p>
                <strong>Your time:</strong> {formatSessionTime(session.startsAt, timezone)}
              </p>
              <p>
                <strong>Their profile time zone:</strong> {other.memberProfile?.timezone || "UTC"} ·{" "}
                {formatSessionTime(session.startsAt, other.memberProfile?.timezone || "UTC")}
              </p>
              <p>
                60-minute session · 5-minute buffer ending{" "}
                {session.bufferEndsAt
                  ? formatSessionTime(session.bufferEndsAt, timezone)
                  : "after the session"}
              </p>
            </>
          ) : (
            <p>No time has been confirmed yet.</p>
          )}
        </div>
      </section>
      {session.exchangeRequest.type === "CREDIT_LEARNING" && (
        <section className="interaction-panel">
          <h2>Session credits</h2>
          <p>
            Listed price: {session.priceCredits ?? "not set"} credits.{" "}
            {creditPostingEnabled()
              ? "Credit posting is enabled for this approved policy version."
              : "Credit holds and settlement are disabled by default until the approved policy is explicitly enabled."}
          </p>
          {session.creditHold && (
            <p>
              {session.creditHold.amount} credits · {session.creditHold.status.toLowerCase()}
            </p>
          )}
          <Link className="text-link" href="/wallet">
            View your wallet →
          </Link>
          {["CONFIRMED", "COMPLETED"].includes(session.status) && !session.dispute && (
            <p>
              <Link className="text-link" href="/disputes">
                Open a private dispute about this session →
              </Link>
            </p>
          )}
        </section>
      )}
      {pending && (
        <section className="interaction-panel">
          <h2>{pending.kind === "INITIAL" ? "Time proposal" : "Reschedule proposal"}</h2>
          <p>
            <strong>{formatSessionTime(pending.startsAt, timezone)}</strong> in your time zone
          </p>
          <p>
            Proposed by {pending.proposer.memberProfile?.displayName || "SkillSwap Member"}. Respond
            by {formatSessionTime(pending.responseDueAt, timezone)}.
          </p>
          {pending.reason && <p>Reason: {pending.reason}</p>}
          {pending.proposerId !== member.id && pending.responseDueAt > new Date() && (
            <form action={respondToTimeProposal} className="request-owner-actions">
              <input type="hidden" name="sessionId" value={id} />
              <button className="primary-button" name="decision" value="ACCEPT">
                Accept time
              </button>
              <button className="secondary-button" name="decision" value="DECLINE">
                Decline
              </button>
            </form>
          )}
          {pending.proposerId === member.id && pending.responseDueAt > new Date() && (
            <form action={withdrawTimeProposal}>
              <input type="hidden" name="sessionId" value={id} />
              <button className="secondary-button">Withdraw proposal</button>
            </form>
          )}
        </section>
      )}
      {session.status === "PROPOSED" && (!pending || pending.responseDueAt <= new Date()) && (
        <section className="interaction-panel">
          <h2>Propose a session time</h2>
          <form action={proposeReschedule} className="interaction-form session-inline-form">
            <input type="hidden" name="sessionId" value={id} />
            <label>
              Date and time
              <input type="datetime-local" name="startsAtLocal" required />
            </label>
            <label>
              Time zone
              <input name="timezone" defaultValue={timezone} required maxLength={80} />
            </label>
            <button className="primary-button">Send time proposal</button>
          </form>
        </section>
      )}
      {session.status === "CONFIRMED" && (
        <section className="interaction-panel">
          <h2>Join session</h2>
          {meetingLink ? (
            <p>
              <a className="primary-button" href={meetingLink} target="_blank" rel="noreferrer">
                Join with {session.meetingProvider === "ZOOM" ? "Zoom" : "Google Meet"}
              </a>
            </p>
          ) : (
            <p>
              No meeting link has been added yet. Add a Zoom or Google Meet link for both
              participants.
            </p>
          )}
          <form action={saveMeetingLink} className="interaction-form session-inline-form">
            <input type="hidden" name="sessionId" value={id} />
            <label>
              Platform
              <select name="meetingProvider" defaultValue={session.meetingProvider || ""}>
                <option value="">Remove meeting link</option>
                <option value="ZOOM">Zoom</option>
                <option value="GOOGLE_MEET">Google Meet</option>
              </select>
            </label>
            <label>
              HTTPS meeting URL
              <input
                type="url"
                name="meetingLink"
                placeholder="https://zoom.us/j/... or https://meet.google.com/..."
              />
            </label>
            <button className="secondary-button">Save meeting link</button>
          </form>
        </section>
      )}
      {session.status === "CONFIRMED" && (
        <section className="interaction-panel">
          <h2>Your reminder</h2>
          <p>
            One email reminder will be sent at your selected lead time when local email delivery is
            configured.
          </p>
          <form action={updateReminderPreference} className="request-owner-actions">
            <input type="hidden" name="sessionId" value={id} />
            <label className="inline-check">
              <input name="enabled" type="checkbox" defaultChecked={reminderOn} /> Send me a
              reminder
            </label>
            <label>
              When
              <select name="minutes" defaultValue={String(reminderMinutes)}>
                <option value="60">1 hour before</option>
                <option value="180">3 hours before</option>
                <option value="720">12 hours before</option>
                <option value="1440">24 hours before</option>
              </select>
            </label>
            <button className="secondary-button">Save reminder</button>
          </form>
        </section>
      )}
      {session.status === "CONFIRMED" && (
        <section className="interaction-panel">
          <h2>Session outcome</h2>
          {markedComplete ? (
            <p>
              You marked this session complete.{" "}
              {member.id === session.learnerId
                ? session.teacherCompletedAt
                  ? "Both members have confirmed completion."
                  : "Waiting for your partner."
                : session.learnerCompletedAt
                  ? "Both members have confirmed completion."
                  : "Waiting for your partner."}
            </p>
          ) : (
            <form action={markSessionComplete}>
              <input type="hidden" name="sessionId" value={id} />
              <button className="primary-button">Mark session complete</button>
            </form>
          )}
        </section>
      )}
      {session.status === "COMPLETED" && (
        <section className="interaction-panel">
          <h2>Leave optional feedback</h2>
          <p>Rate your experience and share separate public and private feedback.</p>
          <Link className="secondary-button" href={`/sessions/${id}/review`}>
            Review this session
          </Link>
        </section>
      )}
      {canCancel && (
        <section className="interaction-panel">
          <h2>Change or cancel</h2>
          {session.status === "CONFIRMED" && (
            <form action={proposeReschedule} className="interaction-form session-inline-form">
              <input type="hidden" name="sessionId" value={id} />
              <label>
                Propose a new date and time
                <input type="datetime-local" name="startsAtLocal" required />
              </label>
              <label>
                Time zone
                <input name="timezone" defaultValue={timezone} required maxLength={80} />
              </label>
              <label>
                Reason (optional)
                <input name="reason" maxLength={500} />
              </label>
              <p className="form-hint">
                Your partner must accept. Changes within 24 hours are recorded for settlement
                review.
              </p>
              <button className="secondary-button">Propose reschedule</button>
            </form>
          )}
          {session.exchangeRequest.type !== "DIRECT_SWAP" ||
          session.exchangeRequest.directSwap?.status !== "MUTUAL_CANCELLATION_PENDING" ? (
            <form action={cancelSession} className="interaction-form session-inline-form">
              <input type="hidden" name="sessionId" value={id} />
              <label>
                Cancellation reason (optional)
                <input name="reason" maxLength={500} />
              </label>
              <p className="form-hint">
                Cancellations within 24 hours are recorded for settlement review.
              </p>
              <button className="danger-button">Cancel session</button>
            </form>
          ) : (
            <p className="form-hint">
              This direct swap is waiting for mutual cancellation confirmation or Admin review.
            </p>
          )}
        </section>
      )}
      {["CONFIRMED", "CANCELLED"].includes(session.status) && (
        <section className="interaction-panel">
          <h2>Report an emergency or no-show</h2>
          <p>
            Reports are private and sent to Admin for review. A report pauses session resolution
            until reviewed.
          </p>
          <form action={reportSessionIncident} className="interaction-form">
            <input type="hidden" name="sessionId" value={id} />
            <label>
              Report type
              <select name="type">
                <option value="EMERGENCY">Emergency</option>
                <option value="NO_SHOW">No-show</option>
              </select>
            </label>
            <label>
              What happened?
              <textarea name="details" minLength={10} maxLength={2000} rows={4} required />
            </label>
            <button className="secondary-button">Submit private report</button>
          </form>
        </section>
      )}
      <section className="interaction-panel">
        <h2>Session history</h2>
        <ol className="activity-list">
          {session.events.map((event) => (
            <li key={event.id}>
              <strong>{event.eventKey.toLowerCase().replaceAll("_", " ")}</strong> · {event.summary}
              <time>{formatSessionTime(event.createdAt, timezone)}</time>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
