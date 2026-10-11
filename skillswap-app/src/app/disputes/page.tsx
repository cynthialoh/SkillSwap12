import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { fileDisputeAppeal, openSessionDispute } from "./actions";

export default async function DisputesPage() {
  const member = await requireMemberPage();
  const prisma = getPrismaClient();
  const [sessions, cases] = await Promise.all([
    prisma.session.findMany({
      where: {
        exchangeRequest: { type: "CREDIT_LEARNING" },
        status: { in: ["CONFIRMED", "COMPLETED"] },
        OR: [{ learnerId: member.id }, { teacherId: member.id }],
        dispute: null,
      },
      orderBy: { updatedAt: "desc" },
      take: 30,
      select: {
        id: true,
        status: true,
        startsAt: true,
        exchangeRequest: { select: { title: true } },
      },
    }),
    prisma.sessionDispute.findMany({
      where: { OR: [{ openedById: member.id }, { otherUserId: member.id }] },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        session: {
          select: {
            id: true,
            exchangeRequest: { select: { title: true } },
            creditHold: { select: { status: true, amount: true } },
          },
        },
        appeal: { select: { id: true, filedById: true, status: true, details: true } },
      },
    }),
  ]);

  return (
    <main className="interaction-page">
      <Link className="text-link" href="/member">
        ← Member workspace
      </Link>
      <section className="interaction-panel form-panel">
        <p className="section-kicker">PRIVATE CASES</p>
        <h1>Session disputes</h1>
        <p>
          Open a dispute for a credit-learning session. The session pauses while Admin reviews it,
          and any active held credits are frozen. Dispute details are visible to you and authorized
          Admins.
        </p>
        {sessions.length ? (
          sessions.map((session) => (
            <form
              key={session.id}
              action={openSessionDispute}
              className="interaction-form dispute-open-form"
            >
              <input type="hidden" name="sessionId" value={session.id} />
              <h2>{session.exchangeRequest.title}</h2>
              <p>
                {session.status.toLowerCase()} ·{" "}
                {session.startsAt?.toLocaleString() ?? "Time not set"}
              </p>
              <label>
                What happened?
                <textarea
                  name="details"
                  minLength={30}
                  maxLength={2000}
                  rows={4}
                  required
                  placeholder="Describe the issue and what resolution you are seeking."
                />
              </label>
              <button className="secondary-button">Open private dispute</button>
            </form>
          ))
        ) : (
          <p className="empty-state">No eligible credit-learning sessions need a dispute.</p>
        )}
      </section>
      <section className="interaction-panel">
        <h2>Your dispute history</h2>
        {cases.length ? (
          <ul className="audit-list">
            {cases.map((item) => {
              const isOpener = item.openedById === member.id;
              const canAppeal = item.status === "RESOLVED" && item.resolvedAt && !item.appeal;
              return (
                <li key={item.id}>
                  <strong>
                    {item.session.exchangeRequest.title} ·{" "}
                    {item.status.toLowerCase().replaceAll("_", " ")}
                  </strong>
                  <p>
                    {isOpener
                      ? item.details
                      : "A dispute was opened for this session. Details are shared only with the reporting Member and authorized Admins."}
                  </p>
                  <p>
                    {item.session.creditHold
                      ? `${item.session.creditHold.amount} credits · hold ${item.session.creditHold.status.toLowerCase()}`
                      : "No credit hold on this session."}
                  </p>
                  {item.outcome && ["RESOLVED", "CLOSED"].includes(item.status) && (
                    <p>
                      Admin outcome:{" "}
                      {item.outcome === "PAY_TEACHER"
                        ? "pay the teacher"
                        : "return the learner’s held credits"}
                      . {item.memberSummary}
                      {item.status === "RESOLVED"
                        ? " Appeal available for seven days."
                        : " Final decision recorded."}
                    </p>
                  )}
                  {item.appeal && (
                    <p>
                      Appeal:{" "}
                      {item.appeal.filedById === member.id
                        ? item.appeal.details
                        : "An appeal was filed and is awaiting Admin review."}{" "}
                      · {item.appeal.status.toLowerCase()}
                    </p>
                  )}
                  {canAppeal && (
                    <form action={fileDisputeAppeal} className="interaction-form">
                      <input type="hidden" name="disputeId" value={item.id} />
                      <label>
                        Appeal the decision
                        <textarea
                          name="details"
                          minLength={30}
                          maxLength={1500}
                          rows={3}
                          required
                          placeholder="Explain the specific part of the decision you are appealing."
                        />
                      </label>
                      <button className="secondary-button">File one appeal</button>
                    </form>
                  )}
                  <Link href={`/sessions/${item.session.id}`}>Open session</Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-state">No disputes have been opened on your sessions.</p>
        )}
      </section>
    </main>
  );
}
