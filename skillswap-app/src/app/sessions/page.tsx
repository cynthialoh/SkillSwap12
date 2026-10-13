import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { formatSessionTime } from "@/lib/sessions";

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const member = await requireMemberPage();
  const [sessions, pendingRequests, params] = await Promise.all([
    getPrismaClient().session.findMany({
      where: { OR: [{ learnerId: member.id }, { teacherId: member.id }] },
      include: {
        learner: { select: { id: true, memberProfile: { select: { displayName: true } } } },
        teacher: { select: { id: true, memberProfile: { select: { displayName: true } } } },
        exchangeRequest: {
          select: {
            title: true,
            type: true,
            targetSkillName: true,
            offerSkillName: true,
            directSwap: {
              select: {
                status: true,
                requesterDepositCredits: true,
                recipientDepositCredits: true,
              },
            },
          },
        },
        proposals: { where: { status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    getPrismaClient().exchangeRequest.findMany({
      where: { status: "ACCEPTED", OR: [{ requesterId: member.id }, { recipientId: member.id }] },
      select: {
        id: true,
        title: true,
        type: true,
        targetSkillName: true,
        offerSkillName: true,
        requesterId: true,
        sessions: { select: { legNumber: true } },
        requester: { select: { memberProfile: { select: { displayName: true } } } },
        recipient: { select: { id: true, memberProfile: { select: { displayName: true } } } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    searchParams,
  ]);
  const readySessions = pendingRequests.flatMap((request) => {
    const scheduledLegs = new Set(request.sessions.map((session) => session.legNumber));
    if (request.type !== "DIRECT_SWAP")
      return scheduledLegs.has(1) ? [] : [{ request, legNumber: 1 }];
    if (!scheduledLegs.has(1)) return [{ request, legNumber: 1 }];
    return scheduledLegs.has(2) ? [] : [{ request, legNumber: 2 }];
  });
  const incomingSessionRequests = sessions.filter((session) => {
    const proposal = session.proposals[0];
    return proposal && proposal.proposerId !== member.id && proposal.responseDueAt > new Date();
  });
  const timezone = member.profile?.timezone || "UTC";
  return (
    <main className="interaction-page">
      <header className="interaction-header">
        <div>
          <p className="section-kicker">LEARNING TOGETHER</p>
          <h1>Sessions</h1>
          <p>
            Propose a time with a member after an exchange is accepted. Times are shown in your
            profile time zone ({timezone}).
          </p>
        </div>
        <nav className="interaction-nav">
          <Link href="/exchanges">Exchanges</Link>
          <Link href="/connections">Connections</Link>
          <Link href="/member">Workspace</Link>
        </nav>
      </header>
      {params.notice && <p className="success-notice">{params.notice}</p>}
      {params.error && <p className="error-notice">{params.error}</p>}
      {incomingSessionRequests.length > 0 && (
        <section className="interaction-panel">
          <h2>Session requests to review</h2>
          <p className="form-hint">
            Review each proposed time here. You can accept or decline it on the request details
            page.
          </p>
          <div className="session-list">
            {incomingSessionRequests.map((session) => {
              const proposal = session.proposals[0]!;
              const other = member.id === session.learnerId ? session.teacher : session.learner;
              const skillName =
                session.legNumber === 1
                  ? session.exchangeRequest.targetSkillName
                  : session.exchangeRequest.offerSkillName;
              return (
                <article className="session-card" key={session.id}>
                  <div className="request-board-heading">
                    <div>
                      <h3>{skillName}</h3>
                      <p>
                        {session.exchangeRequest.title} · With{" "}
                        {other.memberProfile?.displayName || "SkillSwap Member"}
                      </p>
                    </div>
                    <span className="status-pill">Needs your response</span>
                  </div>
                  <p>
                    Proposed time: <strong>{formatSessionTime(proposal.startsAt, timezone)}</strong>
                  </p>
                  <Link className="primary-button" href={`/sessions/${session.id}`}>
                    Review and accept
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      )}
      {readySessions.length > 0 && (
        <section className="interaction-panel">
          <h2>Ready to schedule</h2>
          <div className="request-list">
            {readySessions.map(({ request, legNumber }) => {
              const other =
                member.id === request.requesterId ? request.recipient : request.requester;
              const skillName = legNumber === 1 ? request.targetSkillName : request.offerSkillName;
              const partnerName = other.memberProfile?.displayName;
              return (
                <article className="request-board-card" key={`${request.id}-${legNumber}`}>
                  <h3>{request.title}</h3>
                  <p>
                    {request.type === "DIRECT_SWAP"
                      ? `Direct swap · Session ${legNumber} · `
                      : "Learning session · "}
                    {skillName} with {partnerName || "SkillSwap Member"}
                  </p>
                  <Link
                    className="primary-button"
                    href={`/sessions/new?exchangeRequestId=${request.id}&legNumber=${legNumber}`}
                  >
                    Propose a session
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      )}
      <section className="interaction-panel">
        <h2>Your sessions</h2>
        {sessions.length ? (
          <div className="session-list">
            {sessions.map((session) => {
              const other = member.id === session.learnerId ? session.teacher : session.learner;
              const skillName =
                session.legNumber === 1
                  ? session.exchangeRequest.targetSkillName
                  : session.exchangeRequest.offerSkillName;
              return (
                <article className="session-card" key={session.id}>
                  <div className="request-board-heading">
                    <div>
                      <h3>{skillName}</h3>
                      <p>
                        {session.exchangeRequest.title} · With{" "}
                        {other.memberProfile?.displayName || "SkillSwap Member"}
                      </p>
                    </div>
                    <span className="status-pill">
                      {session.status.toLowerCase().replaceAll("_", " ")}
                    </span>
                  </div>
                  {session.startsAt && (
                    <p>
                      <strong>{formatSessionTime(session.startsAt, timezone)}</strong> · 60 minutes
                      plus a 5-minute buffer
                    </p>
                  )}
                  {session.exchangeRequest.type === "DIRECT_SWAP" &&
                    session.exchangeRequest.directSwap && (
                      <p className="form-hint">
                        Direct swap ·{" "}
                        {session.exchangeRequest.directSwap.status
                          .toLowerCase()
                          .replaceAll("_", " ")}{" "}
                        · deposits {session.exchangeRequest.directSwap.requesterDepositCredits} /{" "}
                        {session.exchangeRequest.directSwap.recipientDepositCredits} credits
                      </p>
                    )}
                  {session.proposals[0] && (
                    <p className="form-hint">A time proposal is waiting for a response.</p>
                  )}
                  <Link className="secondary-button" href={`/sessions/${session.id}`}>
                    Session details
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">No sessions yet. Accept an exchange, then propose a time.</p>
        )}
      </section>
    </main>
  );
}
