import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function LearningRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const member = await requireMemberPage();
  const q = (await searchParams).q?.trim().slice(0, 100) ?? "";
  const prisma = getPrismaClient();
  const blocks = await prisma.profileBlock.findMany({
    where: { OR: [{ blockerId: member.id }, { blockedUserId: member.id }] },
    select: { blockerId: true, blockedUserId: true },
  });
  const hiddenIds = blocks.map((b) => (b.blockerId === member.id ? b.blockedUserId : b.blockerId));
  const requests = await prisma.learningRequest.findMany({
    where: {
      status: "OPEN",
      ownerId: { not: member.id, notIn: hiddenIds },
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" } },
              { skillName: { contains: q, mode: "insensitive" } },
              { scope: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      owner: {
        status: "ACTIVE",
        adminGrant: null,
        authUser: { is: { emailVerified: true } },
        memberProfile: {
          is: {
            isDiscoverable: true,
            OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: new Date() } }],
          },
        },
      },
    },
    include: {
      owner: {
        select: {
          id: true,
          createdAt: true,
          memberProfile: {
            select: { displayName: true, profileVisibility: true, privacyReviewRequired: true },
          },
        },
      },
      _count: { select: { responses: { where: { visibility: "PUBLIC" } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const ownRequests = await prisma.learningRequest.findMany({
    where: { ownerId: member.id },
    include: { _count: { select: { responses: true } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  return (
    <main className="interaction-page">
      <header className="interaction-header">
        <div>
          <p className="section-kicker">LEARNING REQUEST BOARD</p>
          <h1>What do you want to learn?</h1>
          <p>
            Browse open requests and respond with a matching teaching skill. Your response can be
            public or private.
          </p>
        </div>
        <nav className="interaction-nav">
          <Link href="/member">Workspace</Link>
          <Link href="/exchanges">Exchange requests</Link>
          <Link href="/connections">Connections</Link>
        </nav>
      </header>
      <section className="interaction-panel">
        <h2>My learning requests</h2>
        {ownRequests.length ? (
          <div className="saved-list">
            {ownRequests.map((request) => (
              <article key={request.id}>
                <div>
                  <strong>{request.title}</strong>
                  <span>
                    {request.skillName} · {request.status.toLowerCase()} ·{" "}
                    {request._count.responses} responses
                  </span>
                </div>
                <Link href={"/requests/" + request.id}>Manage request</Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">You have not posted a learning request.</p>
        )}
      </section>
      <section className="interaction-panel">
        <div className="interaction-panel-heading">
          <h2>Open requests</h2>
          <Link className="primary-button" href="/requests/new">
            Post a learning request
          </Link>
        </div>
        <form action="/requests" className="interaction-search">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search skills or outcomes"
            aria-label="Search requests"
          />
          <button className="secondary-button">Search</button>
        </form>
        {requests.length ? (
          <div className="request-list">
            {requests.map((r) => {
              const privatePreview =
                r.owner.memberProfile?.profileVisibility === "PRIVATE" ||
                r.owner.memberProfile?.privacyReviewRequired;
              return (
                <article className="request-board-card" key={r.id}>
                  <div className="request-board-heading">
                    <div>
                      <span className="skill-direction learn">WANTS TO LEARN · {r.skillName}</span>
                      <h3>
                        <Link href={"/requests/" + r.id}>{r.title}</Link>
                      </h3>
                    </div>
                    <span className="request-response-count">{r._count.responses} responses</span>
                  </div>
                  <p>{r.scope}</p>
                  <div className="request-outcome">
                    <strong>Goal:</strong> {r.expectedOutcome}
                  </div>
                  <p className="request-author">
                    Posted by {r.owner.memberProfile?.displayName || "SkillSwap Member"}
                    {privatePreview ? " · basic profile" : ""}
                  </p>
                  <Link className="text-link" href={"/requests/" + r.id}>
                    View request and respond →
                  </Link>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No open requests found</h3>
            <p>Try a broader search or post your own request.</p>
            <Link href="/requests/new">Create a request</Link>
          </div>
        )}
      </section>
    </main>
  );
}
