import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { proposeSessionTime } from "../actions";

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ exchangeRequestId?: string; legNumber?: string }>;
}) {
  const member = await requireMemberPage();
  const params = await searchParams;
  const exchangeRequestId = params.exchangeRequestId;
  if (!exchangeRequestId) {
    const requests = await getPrismaClient().exchangeRequest.findMany({
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
        recipient: { select: { memberProfile: { select: { displayName: true } } } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    const options = requests.flatMap((request) => {
      const scheduled = new Set(request.sessions.map((session) => session.legNumber));
      if (request.type !== "DIRECT_SWAP")
        return scheduled.has(1) ? [] : [{ request, legNumber: 1 }];
      if (!scheduled.has(1)) return [{ request, legNumber: 1 }];
      return scheduled.has(2) ? [] : [{ request, legNumber: 2 }];
    });
    return (
      <main className="interaction-page">
        <Link className="text-link" href="/sessions">
          ← Sessions
        </Link>
        <section className="interaction-panel">
          <p className="section-kicker">CHOOSE AN EXCHANGE</p>
          <h1>What would you like to schedule?</h1>
          {options.length ? (
            <div className="request-list">
              {options.map(({ request, legNumber }) => (
                <article className="request-board-card" key={`${request.id}-${legNumber}`}>
                  <h3>{request.title}</h3>
                  <p>
                    {legNumber === 2 ? request.offerSkillName : request.targetSkillName} ·{" "}
                    {member.id === request.requesterId
                      ? request.recipient.memberProfile?.displayName
                      : request.requester.memberProfile?.displayName}
                  </p>
                  <Link
                    className="primary-button"
                    href={`/sessions/new?exchangeRequestId=${request.id}&legNumber=${legNumber}`}
                  >
                    Choose this session
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">There are no accepted exchanges ready to schedule.</p>
          )}
        </section>
      </main>
    );
  }
  const legNumber = Number(params.legNumber || "1");
  const request = await getPrismaClient().exchangeRequest.findFirst({
    where: {
      id: exchangeRequestId,
      status: "ACCEPTED",
      OR: [{ requesterId: member.id }, { recipientId: member.id }],
    },
    select: {
      id: true,
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
      requesterId: true,
      sessions: { select: { legNumber: true } },
      requester: { select: { memberProfile: { select: { displayName: true } } } },
      recipient: { select: { memberProfile: { select: { displayName: true } } } },
    },
  });
  const validLeg =
    request && [1, 2].includes(legNumber) && !(legNumber === 2 && request.type !== "DIRECT_SWAP");
  const legExists = request?.sessions.some((session) => session.legNumber === legNumber);
  const firstExists = request?.sessions.some((session) => session.legNumber === 1);
  if (!request || !validLeg || legExists || (legNumber === 2 && !firstExists)) notFound();
  const other = member.id === request.requesterId ? request.recipient : request.requester;
  const skillName = legNumber === 1 ? request.targetSkillName : request.offerSkillName;
  return (
    <main className="interaction-page">
      <Link className="text-link" href="/sessions">
        ← Sessions
      </Link>
      <section className="interaction-panel form-panel">
        <p className="section-kicker">
          PROPOSE A SESSION{request.type === "DIRECT_SWAP" ? ` · SESSION ${legNumber} OF 2` : ""}
        </p>
        <h1>
          {skillName} with {other.memberProfile?.displayName || "SkillSwap Member"}
        </h1>
        <p>{request.title}</p>
        {request.type === "DIRECT_SWAP" && request.directSwap && (
          <p className="privacy-notice">
            Two sessions are required. Quote: requester deposits{" "}
            {request.directSwap.requesterDepositCredits} credits and recipient deposits{" "}
            {request.directSwap.recipientDepositCredits} credits. Propose both session times before
            either can be confirmed. Deposits are held before confirmation once the credit policy is
            approved.
          </p>
        )}
        <form action={proposeSessionTime} className="interaction-form">
          <input type="hidden" name="exchangeRequestId" value={request.id} />
          <input type="hidden" name="legNumber" value={legNumber} />
          <label>
            Proposed date and time
            <input type="datetime-local" name="startsAtLocal" required />
            <span className="form-hint">
              Choose a time at least two hours from now. The session lasts 60 minutes, followed by a
              5-minute scheduling buffer.
            </span>
          </label>
          <label>
            Time zone (IANA name)
            <input
              name="timezone"
              defaultValue={member.profile?.timezone || "UTC"}
              required
              maxLength={80}
              placeholder="Asia/Dubai"
            />
            <span className="form-hint">
              Your partner will see this time converted to their current profile time zone.
            </span>
          </label>
          <label>
            Meeting platform
            <select name="meetingProvider">
              <option value="">Add a meeting link later</option>
              <option value="ZOOM">Zoom</option>
              <option value="GOOGLE_MEET">Google Meet</option>
            </select>
          </label>
          <label>
            Meeting link
            <input name="meetingLink" type="url" placeholder="https://meet.google.com/..." />
            <span className="form-hint">
              Only HTTPS links from zoom.us or meet.google.com are accepted. Links are encrypted in
              the database and shown to confirmed participants.
            </span>
          </label>
          <p className="privacy-notice">
            The other member must accept before the session is confirmed. Overlapping confirmed
            sessions are rejected.
          </p>
          <button className="primary-button">Send time proposal</button>
        </form>
      </section>
    </main>
  );
}
