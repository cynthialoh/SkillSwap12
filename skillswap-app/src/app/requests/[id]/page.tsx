import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  closeLearningRequest,
  decideLearningResponse,
  respondToLearningRequest,
  withdrawLearningResponse,
} from "../actions";

export default async function LearningRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const member = await requireMemberPage();
  const { id } = await params;
  const prisma = getPrismaClient();
  const request = await prisma.learningRequest.findUnique({
    where: { id },
    include: {
      owner: {
        select: {
          id: true,
          status: true,
          createdAt: true,
          authUser: { select: { emailVerified: true } },
          memberProfile: {
            select: {
              displayName: true,
              profileVisibility: true,
              privacyReviewRequired: true,
              isDiscoverable: true,
              hiddenUntil: true,
            },
          },
        },
      },
      responses: {
        where: { OR: [{ visibility: "PUBLIC" }, { responderId: member.id }] },
        include: {
          responder: {
            select: {
              id: true,
              memberProfile: {
                select: { displayName: true, profileVisibility: true, privacyReviewRequired: true },
              },
            },
          },
          offeredSkill: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      activity: { orderBy: { createdAt: "desc" }, take: 30 },
    },
  });
  if (!request || (request.ownerId !== member.id && request.status !== "OPEN")) notFound();
  const relationshipBlock = await prisma.profileBlock.findFirst({
    where: {
      OR: [
        { blockerId: member.id, blockedUserId: request.ownerId },
        { blockerId: request.ownerId, blockedUserId: member.id },
      ],
    },
    select: { id: true },
  });
  if (relationshipBlock) notFound();
  const isOwner = request.ownerId === member.id;
  if (
    !isOwner &&
    (request.owner.status !== "ACTIVE" ||
      !request.owner.authUser?.emailVerified ||
      !request.owner.memberProfile?.isDiscoverable ||
      Boolean(
        request.owner.memberProfile.hiddenUntil &&
          request.owner.memberProfile.hiddenUntil > new Date(),
      ))
  )
    notFound();
  const privateProfile =
    request.owner.memberProfile?.profileVisibility === "PRIVATE" ||
    request.owner.memberProfile?.privacyReviewRequired;
  const [matchingSkills, offerSkills, prior] = await Promise.all([
    prisma.skillListing.findMany({
      where: {
        userId: member.id,
        direction: "TEACH",
        isActive: true,
        name: { equals: request.skillName, mode: "insensitive" },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.skillListing.findMany({
      where: { userId: member.id, direction: "TEACH", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.learningRequestResponse.findUnique({
      where: { requestId_responderId: { requestId: id, responderId: member.id } },
      select: { status: true },
    }),
  ]);
  const notice = (await searchParams).notice;
  const error = (await searchParams).error;
  return (
    <main className="interaction-page">
      <nav className="interaction-nav">
        <Link href="/requests">Learning requests</Link>
        <Link href="/member">Workspace</Link>
      </nav>
      <section className="interaction-panel request-detail">
        {notice && <p className="success-notice">{notice}</p>}
        {error && <p className="error-notice">{error}</p>}
        <p className="section-kicker">
          {request.status === "OPEN" ? "OPEN LEARNING REQUEST" : "CLOSED REQUEST"} ·{" "}
          {request.skillName}
        </p>
        <h1>{request.title}</h1>
        <p className="request-author">
          Posted by {request.owner.memberProfile?.displayName || "SkillSwap Member"}
          {privateProfile ? " · basic profile" : ""} · {request.createdAt.toLocaleDateString()}
        </p>
        <div className="request-detail-copy">
          <h2>What they want to learn</h2>
          <p>{request.scope}</p>
          <h2>Expected outcome</h2>
          <p>{request.expectedOutcome}</p>
        </div>
        {isOwner ? (
          <div className="request-owner-actions">
            <Link className="secondary-button" href={"/requests/" + id + "/edit"}>
              Edit request
            </Link>
            {request.status === "OPEN" && (
              <form action={closeLearningRequest}>
                <input type="hidden" name="requestId" value={id} />
                <button className="danger-button">Close request</button>
              </form>
            )}
          </div>
        ) : prior?.status === "PENDING" ? (
          <div className="privacy-notice">
            <p>Your response is waiting for the request owner.</p>
            <form action={withdrawLearningResponse}>
              <input
                type="hidden"
                name="responseId"
                value={request.responses.find((r) => r.responderId === member.id)?.id ?? ""}
              />
              <button className="text-button">Withdraw response</button>
            </form>
          </div>
        ) : prior?.status === "ACCEPTED" ? (
          <p className="privacy-notice">
            Your response was accepted. Check your connections to continue.
          </p>
        ) : request.status === "OPEN" && matchingSkills.length ? (
          <form action={respondToLearningRequest} className="interaction-form response-form">
            <h2>Respond to this request</h2>
            <label>
              Optional: another skill you can teach in return
              <select name="offeredSkillId" defaultValue="">
                <option value="">No additional teach offer</option>
                {offerSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Your response
              <textarea
                name="message"
                minLength={10}
                maxLength={1000}
                rows={4}
                required
                placeholder="Explain how you can help with this learning goal."
              />
            </label>
            <label>
              Response visibility
              <select name="visibility">
                <option value="PRIVATE">Private response</option>
                <option value="PUBLIC">Public response</option>
              </select>
            </label>
            <input type="hidden" name="requestId" value={id} />
            <button className="primary-button">Send response</button>
          </form>
        ) : request.status === "OPEN" ? (
          <p className="empty-state">Add a skill to your “Can teach” list before responding.</p>
        ) : null}
      </section>
      {(isOwner || request.responses.length > 0) && (
        <section className="interaction-panel">
          <h2>{isOwner ? "Responses" : "Public responses"}</h2>
          {request.responses.length ? (
            <div className="request-list">
              {request.responses.map((r) => (
                <article className="response-card" key={r.id}>
                  <div className="request-board-heading">
                    <strong>{r.responder.memberProfile?.displayName || "SkillSwap Member"}</strong>
                    <span className="status-pill">{r.status.toLowerCase()}</span>
                  </div>
                  <p>{r.message}</p>
                  {r.offeredSkill && <p className="form-hint">Can teach: {r.offeredSkill.name}</p>}
                  <p className="form-hint">
                    {r.visibility === "PUBLIC" ? "Public response" : "Private response"} ·{" "}
                    {r.createdAt.toLocaleDateString()}
                  </p>
                  {isOwner && request.status === "OPEN" && r.status === "PENDING" && (
                    <form action={decideLearningResponse} className="request-owner-actions">
                      <input type="hidden" name="responseId" value={r.id} />
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
                      Open connections →
                    </Link>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No responses yet.</p>
          )}
        </section>
      )}
      {isOwner && (
        <section className="interaction-panel">
          <h2>Request activity</h2>
          <ul className="activity-list">
            {request.activity.map((a) => (
              <li key={a.id}>
                <span>{a.summary || a.eventKey}</span>
                <time>{a.createdAt.toLocaleString()}</time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
