import { notFound, redirect } from "next/navigation";
import { getActor, requireAdmin } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { SignOutButton } from "@/components/sign-out-button";
import Link from "next/link";
import { creditPostingEnabled } from "@/lib/credit-ledger";
import { resolveDirectSwap, reviewSessionIncident, updateSafetyReportStatus } from "./actions";
import { AdminNavigation } from "./admin-shared";

export default async function AdminPage() {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  if (!actor.isAdmin || actor.status !== "ACTIVE") notFound();
  await requireAdmin();
  const events = await getPrismaClient().securityAuditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, eventKey: true, reason: true, createdAt: true, targetUserId: true },
  });
  const reports = await getPrismaClient().safetyReport.findMany({
    where: { status: { in: ["OPEN", "IN_REVIEW"] } },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      category: true,
      details: true,
      context: true,
      createdAt: true,
      reporter: { select: { memberProfile: { select: { displayName: true } } } },
      reportedUser: { select: { id: true, memberProfile: { select: { displayName: true } } } },
      message: { select: { body: true, createdAt: true } },
    },
  });
  const incidents = await getPrismaClient().sessionIncident.findMany({
    where: { status: { in: ["OPEN", "IN_REVIEW"] } },
    orderBy: { createdAt: "asc" },
    take: 50,
    include: {
      reporter: { select: { memberProfile: { select: { displayName: true } } } },
      reportedUser: { select: { memberProfile: { select: { displayName: true } } } },
      session: { select: { id: true, exchangeRequest: { select: { title: true } } } },
    },
  });
  const [activeCreditHolds, creditTransactions, directSwapCases] = await Promise.all([
    getPrismaClient().creditHold.findMany({
      where: { status: { in: ["ACTIVE", "FROZEN"] } },
      orderBy: { createdAt: "asc" },
      take: 100,
      include: {
        user: { select: { memberProfile: { select: { displayName: true } } } },
        session: { select: { id: true, exchangeRequest: { select: { title: true } } } },
        holdTransaction: { select: { idempotencyKey: true, createdAt: true } },
      },
    }),
    getPrismaClient().creditLedgerTransaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        entries: { include: { account: { select: { code: true, type: true } } } },
        actor: { select: { memberProfile: { select: { displayName: true } } } },
        session: { select: { id: true } },
      },
    }),
    getPrismaClient().directSwap.findMany({
      where: { status: { in: ["MUTUAL_CANCELLATION_PENDING", "RESOLUTION_PENDING"] } },
      orderBy: { updatedAt: "asc" },
      take: 50,
      include: {
        requester: {
          select: {
            id: true,
            memberProfile: {
              select: {
                displayName: true,
                directSwapStrikeCount: true,
                directSwapSuspendedUntil: true,
              },
            },
          },
        },
        recipient: {
          select: {
            id: true,
            memberProfile: {
              select: {
                displayName: true,
                directSwapStrikeCount: true,
                directSwapSuspendedUntil: true,
              },
            },
          },
        },
        exchangeRequest: {
          select: {
            id: true,
            title: true,
            targetSkillName: true,
            offerSkillName: true,
            sessions: {
              orderBy: { legNumber: "asc" },
              select: {
                id: true,
                legNumber: true,
                status: true,
                startsAt: true,
                teacherId: true,
                priceCredits: true,
                creditHold: { select: { amount: true, status: true } },
                incidents: {
                  where: { status: { in: ["OPEN", "IN_REVIEW", "ACCEPTED"] } },
                  select: { type: true, status: true, details: true, reportedUserId: true },
                },
              },
            },
          },
        },
      },
    }),
  ]);
  return (
    <main className="auth-page">
      <section className="auth-card member-card">
        <div className="member-heading">
          <div>
            <p className="section-kicker">PROTECTED OPERATIONS</p>
            <h1>Admin workspace</h1>
          </div>
          <SignOutButton />
        </div>
        <p className="auth-intro">
          Admin access comes from a controlled server-side grant. This page checks that grant on
          every request.
        </p>
        <AdminNavigation current="/admin" />
        <Link className="secondary-button" href="/admin/trust">
          Open trust, verification, disputes, and appeals
        </Link>
        <h2 className="audit-heading">Open safety reports</h2>
        {reports.length ? (
          <ul className="audit-list">
            {reports.map((report) => (
              <li key={report.id} className="safety-report-row">
                <strong>{report.category.replaceAll("_", " ")}</strong>
                <span>
                  {report.reporter.memberProfile?.displayName || "Member"} reported{" "}
                  {report.reportedUser.memberProfile?.displayName || "a Member"}: {report.details}
                  {report.context ? ` Context: ${report.context}` : ""}
                  {report.message ? ` Reported message: ${report.message.body}` : ""}
                </span>
                <form action={updateSafetyReportStatus} className="report-review-actions">
                  <input type="hidden" name="reportId" value={report.id} />
                  <button name="status" value="IN_REVIEW" className="secondary-button">
                    Mark in review
                  </button>
                  <button name="status" value="RESOLVED" className="secondary-button">
                    Resolve
                  </button>
                  <button name="status" value="DISMISSED" className="text-button">
                    Dismiss
                  </button>
                </form>
                <time dateTime={report.createdAt.toISOString()}>
                  {report.createdAt.toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No open safety reports.</p>
        )}
        <h2 className="audit-heading">Session emergencies and no-shows</h2>
        {incidents.length ? (
          <ul className="audit-list">
            {incidents.map((incident) => (
              <li key={incident.id} className="safety-report-row">
                <strong>{incident.type.replaceAll("_", " ")}</strong>
                <span>
                  {incident.reporter.memberProfile?.displayName || "Member"} reported{" "}
                  {incident.reportedUser.memberProfile?.displayName || "a Member"}:{" "}
                  {incident.details}
                  <br />
                  Session: {incident.session.exchangeRequest.title}
                </span>
                <form action={reviewSessionIncident} className="interaction-form">
                  <input type="hidden" name="incidentId" value={incident.id} />
                  <label>
                    Private Admin note
                    <textarea name="adminNote" maxLength={1000} rows={2} />
                  </label>
                  <div className="report-review-actions">
                    <button name="status" value="IN_REVIEW" className="secondary-button">
                      Mark in review
                    </button>
                    <button name="status" value="ACCEPTED" className="secondary-button">
                      Accept report
                    </button>
                    <button name="status" value="REJECTED" className="text-button">
                      Reject report
                    </button>
                    <a href={`/sessions/${incident.session.id}`}>Open session</a>
                  </div>
                </form>
                <time dateTime={incident.createdAt.toISOString()}>
                  {incident.createdAt.toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No open session incident reports.</p>
        )}
        <h2 className="audit-heading">Direct-swap resolution review</h2>
        <p className="auth-intro">
          This queue preserves both deposits until a mutual cancellation or an Admin outcome.
          Financial outcomes remain gated by the owner-approved credit policy.
        </p>
        {directSwapCases.length ? (
          <ul className="audit-list">
            {directSwapCases.map((swap) => (
              <li key={swap.id} className="safety-report-row">
                <strong>
                  {swap.exchangeRequest.title} · {swap.status.toLowerCase().replaceAll("_", " ")}
                </strong>
                <span>
                  {swap.requester.memberProfile?.displayName || "Requester"} ↔{" "}
                  {swap.recipient.memberProfile?.displayName || "Recipient"}
                  {` · strikes ${swap.requester.memberProfile?.directSwapStrikeCount ?? 0}/${swap.recipient.memberProfile?.directSwapStrikeCount ?? 0}`}
                  <br />
                  Session 1: {swap.exchangeRequest.targetSkillName} ({swap.targetSkillValueCredits}{" "}
                  value / {swap.requesterDepositCredits} deposit) · Session 2:{" "}
                  {swap.exchangeRequest.offerSkillName} ({swap.offerSkillValueCredits} value /{" "}
                  {swap.recipientDepositCredits} deposit)
                  <br />
                  {swap.exchangeRequest.sessions
                    .map((part) => {
                      const teacherCompleted = part.status === "COMPLETED";
                      return `Session ${part.legNumber} ${part.status.toLowerCase().replaceAll("_", " ")}${part.creditHold ? `, ${part.creditHold.amount} ${part.creditHold.status.toLowerCase()}` : ", no deposit posted"}${teacherCompleted ? ", taught leg complete" : ""}${part.incidents.length ? `, reports: ${part.incidents.map((incident) => `${incident.type.toLowerCase()} ${incident.status.toLowerCase()} (${incident.details})`).join("; ")}` : ""}`;
                    })
                    .join(" · ")}
                  {swap.cancellationRequestedById &&
                    ` · Cancellation requested by ${swap.cancellationRequestedById === swap.requesterId ? "requester" : "recipient"}${swap.cancellationReason ? `: ${swap.cancellationReason}` : ""}`}
                </span>
                <span>
                  Outcome preview: both completed or mutual cancellation returns both deposits. A
                  late cancellation before the other member teaches transfers the cancelling
                  member’s deposit to the other member. If the other member already taught, the
                  responsible deposit goes to SkillSwap and full listed teaching value is awarded
                  from the swap reserve. Emergency and no-show reports require their corresponding
                  approved outcome.
                </span>
                <div className="report-review-actions">
                  {swap.exchangeRequest.sessions.map((part) => (
                    <Link key={part.id} href={`/sessions/${part.id}`}>
                      Open session {part.legNumber}
                    </Link>
                  ))}
                </div>
                {swap.status === "RESOLUTION_PENDING" ? (
                  <form action={resolveDirectSwap} className="interaction-form">
                    <input type="hidden" name="directSwapId" value={swap.id} />
                    <label>
                      Reviewed outcome
                      <select name="outcome" required defaultValue="LATE_CANCEL_BEFORE_TAUGHT">
                        <option value="LATE_CANCEL_BEFORE_TAUGHT">
                          Late cancellation or no-show before the other member taught
                        </option>
                        <option value="FAILURE_AFTER_TAUGHT">
                          Failure after the other member taught
                        </option>
                        <option value="EMERGENCY_COMPENSATION">
                          Accepted emergency: return deposits and pay half session value
                        </option>
                      </select>
                    </label>
                    <label>
                      Responsible participant or emergency affected member
                      <select name="responsibleUserId" defaultValue={swap.requesterId}>
                        <option value={swap.requesterId}>
                          {swap.requester.memberProfile?.displayName || "Requester"}
                        </option>
                        <option value={swap.recipientId}>
                          {swap.recipient.memberProfile?.displayName || "Recipient"}
                        </option>
                      </select>
                    </label>
                    <label>
                      Private resolution reason
                      <textarea name="reason" minLength={15} maxLength={1000} rows={3} required />
                    </label>
                    {!creditPostingEnabled() && (
                      <p className="privacy-notice">
                        Financial finalization is disabled until the owner approves and enables the
                        credit policy.
                      </p>
                    )}
                    <button className="primary-button" disabled={!creditPostingEnabled()}>
                      Finalize outcome and post ledger entries
                    </button>
                  </form>
                ) : (
                  <p className="privacy-notice">
                    Waiting for the other participant to confirm mutual cancellation. Both deposits
                    are returned after both confirm.
                  </p>
                )}
                <time dateTime={swap.updatedAt.toISOString()}>
                  {swap.updatedAt.toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">
            No direct swaps are waiting for mutual cancellation or Admin resolution.
          </p>
        )}
        <h2 className="audit-heading">Credit reconciliation</h2>
        <p className="auth-intro">
          {creditPostingEnabled()
            ? "Credit posting is enabled. Review open holds and recent immutable ledger entries."
            : "Credit posting is disabled by default. This view is read-only until the approved policy is explicitly enabled."}
        </p>
        <h3>Open or frozen holds</h3>
        {activeCreditHolds.length ? (
          <ul className="audit-list">
            {activeCreditHolds.map((hold) => (
              <li key={hold.id}>
                <strong>
                  {hold.amount} credits · {hold.status.toLowerCase()}
                </strong>
                <span>
                  {hold.user.memberProfile?.displayName || "Member"} ·{" "}
                  {hold.session.exchangeRequest.title} · {hold.holdTransaction.idempotencyKey}
                </span>
                <Link href={`/sessions/${hold.session.id}`}>Open session</Link>
                <time dateTime={hold.createdAt.toISOString()}>
                  {hold.createdAt.toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No open or frozen credit holds.</p>
        )}
        <h3>Recent ledger transactions</h3>
        {creditTransactions.length ? (
          <ul className="audit-list">
            {creditTransactions.map((transaction) => (
              <li key={transaction.id}>
                <strong>{transaction.type.replaceAll("_", " ")}</strong>
                <span>
                  {transaction.reason || "Ledger posting"} ·{" "}
                  {transaction.entries
                    .map(
                      (entry) =>
                        `${entry.account.code}: ${entry.amount} (${entry.source.toLowerCase()})`,
                    )
                    .join("; ")}
                </span>
                {transaction.session && (
                  <Link href={`/sessions/${transaction.session.id}`}>Open session</Link>
                )}
                <time dateTime={transaction.createdAt.toISOString()}>
                  {transaction.createdAt.toLocaleString()} ·{" "}
                  {transaction.actor?.memberProfile?.displayName || "System"}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No credit ledger transactions yet.</p>
        )}
        <h2 className="audit-heading">Recent security events</h2>
        {events.length ? (
          <ul className="audit-list">
            {events.map((event) => (
              <li key={event.id}>
                <strong>{event.eventKey}</strong>
                <span>{event.reason}</span>
                <time dateTime={event.createdAt.toISOString()}>
                  {event.createdAt.toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No security events recorded yet.</p>
        )}
      </section>
    </main>
  );
}
