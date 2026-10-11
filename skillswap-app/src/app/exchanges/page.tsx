import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { decideExchangeRequest, withdrawExchangeRequest } from "../requests/actions";

export default async function ExchangesPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const member = await requireMemberPage();
  const prisma = getPrismaClient();
  const blocks = await prisma.profileBlock.findMany({
    where: { OR: [{ blockerId: member.id }, { blockedUserId: member.id }] },
    select: { blockerId: true, blockedUserId: true },
  });
  const blockedIds = blocks.map((b) => (b.blockerId === member.id ? b.blockedUserId : b.blockerId));
  const [incoming, outgoing, params] = await Promise.all([
    prisma.exchangeRequest.findMany({
      where: { recipientId: member.id, requesterId: { notIn: blockedIds } },
      include: {
        requester: { select: { id: true, memberProfile: { select: { displayName: true } } } },
        targetSkill: { select: { name: true } },
        offerSkill: { select: { name: true } },
        activity: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.exchangeRequest.findMany({
      where: { requesterId: member.id, recipientId: { notIn: blockedIds } },
      include: {
        recipient: { select: { id: true, memberProfile: { select: { displayName: true } } } },
        targetSkill: { select: { name: true } },
        offerSkill: { select: { name: true } },
        activity: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    searchParams,
  ]);
  return (
    <main className="interaction-page">
      <header className="interaction-header">
        <div>
          <p className="section-kicker">EXCHANGE REQUESTS</p>
          <h1>Requests and invitations</h1>
          <p>
            Review learning and direct-swap invitations. Accepting connects you and opens a
            conversation. Credit holds and settlement remain disabled until the proposed credit
            policy is approved.
          </p>
        </div>
        <nav className="interaction-nav">
          <Link href="/requests">Learning requests</Link>
          <Link href="/connections">Connections</Link>
          <Link href="/sessions">Sessions</Link>
          <Link href="/discover">Discover</Link>
        </nav>
      </header>
      {params.notice && <p className="success-notice">{params.notice}</p>}
      {params.error && <p className="error-notice">{params.error}</p>}
      <section className="interaction-panel">
        <h2>Received</h2>
        {incoming.length ? (
          <div className="request-list">
            {incoming.map((r) => (
              <article className="request-board-card" key={r.id}>
                <div className="request-board-heading">
                  <h3>
                    {r.type === "DIRECT_SWAP" ? "Direct swap" : "Credit-based learning"} · {r.title}
                  </h3>
                  <span className="status-pill">{r.status.toLowerCase()}</span>
                </div>
                <p>
                  From {r.requester.memberProfile?.displayName || "SkillSwap Member"} · wants you to
                  teach {r.targetSkillName}
                  {r.offerSkillName ? " · can teach " + r.offerSkillName : ""}
                </p>
                <p>{r.scope}</p>
                {r.type === "DIRECT_SWAP" &&
                  r.targetSkillValueCredits &&
                  r.offerSkillValueCredits && (
                    <p>
                      <strong>Deposit quote:</strong>{" "}
                      {r.requester.memberProfile?.displayName || "Requester"} will deposit{" "}
                      {Math.ceil(r.targetSkillValueCredits / 2)} credits; you will deposit{" "}
                      {Math.ceil(r.offerSkillValueCredits / 2)} credits. Both values are snapshotted
                      from the listed teaching skills.
                    </p>
                  )}
                <p>
                  <strong>Expected outcome:</strong> {r.expectedOutcome}
                </p>
                {r.message && <p>{r.message}</p>}
                {r.status === "PENDING" && (
                  <form action={decideExchangeRequest} className="request-owner-actions">
                    <input type="hidden" name="requestId" value={r.id} />
                    <button className="primary-button" name="decision" value="ACCEPTED">
                      Accept and connect
                    </button>
                    <button className="secondary-button" name="decision" value="DECLINED">
                      Decline
                    </button>
                  </form>
                )}
                {r.status === "ACCEPTED" && (
                  <Link className="text-link" href="/connections">
                    Open your conversation →
                  </Link>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No exchange requests received.</p>
        )}
      </section>
      <section className="interaction-panel">
        <h2>Sent</h2>
        {outgoing.length ? (
          <div className="request-list">
            {outgoing.map((r) => (
              <article className="request-board-card" key={r.id}>
                <div className="request-board-heading">
                  <h3>
                    {r.type === "DIRECT_SWAP" ? "Direct swap" : "Credit-based learning"} · {r.title}
                  </h3>
                  <span className="status-pill">{r.status.toLowerCase()}</span>
                </div>
                <p>
                  To {r.recipient.memberProfile?.displayName || "SkillSwap Member"} ·{" "}
                  {r.targetSkillName}
                  {r.offerSkillName ? " ↔ " + r.offerSkillName : ""}
                </p>
                <p>{r.scope}</p>
                {r.type === "DIRECT_SWAP" &&
                  r.targetSkillValueCredits &&
                  r.offerSkillValueCredits && (
                    <p>
                      <strong>Deposit quote:</strong> you will deposit{" "}
                      {Math.ceil(r.targetSkillValueCredits / 2)} credits;{" "}
                      {r.recipient.memberProfile?.displayName || "Recipient"} will deposit{" "}
                      {Math.ceil(r.offerSkillValueCredits / 2)} credits. Both values are snapshotted
                      from the listed teaching skills.
                    </p>
                  )}
                {r.status === "PENDING" && (
                  <form action={withdrawExchangeRequest}>
                    <input type="hidden" name="requestId" value={r.id} />
                    <button className="secondary-button">Withdraw request</button>
                  </form>
                )}
                {r.status === "ACCEPTED" && (
                  <Link className="text-link" href="/connections">
                    Open your conversation →
                  </Link>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">You haven’t sent any exchange requests.</p>
        )}
      </section>
    </main>
  );
}
