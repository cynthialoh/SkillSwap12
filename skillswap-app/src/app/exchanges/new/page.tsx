import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { createExchangeRequest } from "../../requests/actions";

export default async function NewExchangeRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ targetUserId?: string }>;
}) {
  const member = await requireMemberPage();
  const targetUserId = (await searchParams).targetUserId ?? "";
  const prisma = getPrismaClient();
  if (!targetUserId) {
    const blocks = await prisma.profileBlock.findMany({
      where: { OR: [{ blockerId: member.id }, { blockedUserId: member.id }] },
      select: { blockerId: true, blockedUserId: true },
    });
    const excluded = [
      member.id,
      ...blocks.map((b) => (b.blockerId === member.id ? b.blockedUserId : b.blockerId)),
    ];
    const people = await prisma.user.findMany({
      where: {
        id: { notIn: excluded },
        status: "ACTIVE",
        adminGrant: null,
        authUser: { is: { emailVerified: true } },
        memberProfile: {
          is: {
            onboardingCompletedAt: { not: null },
            isDiscoverable: true,
            OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: new Date() } }],
          },
        },
        skillListings: { some: { direction: "TEACH", isActive: true } },
      },
      take: 80,
      select: {
        id: true,
        memberProfile: {
          select: { displayName: true, profileVisibility: true, privacyReviewRequired: true },
        },
        skillListings: {
          where: { direction: "TEACH", isActive: true },
          take: 3,
          select: { name: true },
        },
      },
    });
    return (
      <main className="interaction-page">
        <header className="interaction-header">
          <div>
            <p className="section-kicker">START AN EXCHANGE</p>
            <h1>Choose a member</h1>
            <p>Select someone and choose one of their teaching skills to request.</p>
          </div>
          <nav className="interaction-nav">
            <Link href="/discover">Discover</Link>
            <Link href="/requests">Learning requests</Link>
          </nav>
        </header>
        <section className="interaction-panel">
          <div className="request-list">
            {people.map((p) => (
              <article className="request-board-card" key={p.id}>
                <h3>{p.memberProfile?.displayName || "SkillSwap Member"}</h3>
                <p>{p.skillListings.map((s) => s.name).join(" · ")}</p>
                <Link className="primary-button" href={"/exchanges/new?targetUserId=" + p.id}>
                  Choose member
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>
    );
  }
  const [target, targetSkills, ownSkills] = await Promise.all([
    prisma.user.findFirst({
      where: {
        id: targetUserId,
        status: "ACTIVE",
        adminGrant: null,
        authUser: { is: { emailVerified: true } },
        memberProfile: {
          is: {
            onboardingCompletedAt: { not: null },
            isDiscoverable: true,
            OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: new Date() } }],
          },
        },
      },
      select: {
        id: true,
        memberProfile: {
          select: {
            displayName: true,
            profileVisibility: true,
            privacyReviewRequired: true,
            acceptLearningRequests: true,
            acceptDirectSwapRequests: true,
          },
        },
      },
    }),
    prisma.skillListing.findMany({
      where: { userId: targetUserId, direction: "TEACH", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, priceCredits: true },
    }),
    prisma.skillListing.findMany({
      where: { userId: member.id, direction: "TEACH", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, priceCredits: true },
    }),
  ]);
  if (!target || targetUserId === member.id) notFound();
  const blocked = await prisma.profileBlock.findFirst({
    where: {
      OR: [
        { blockerId: member.id, blockedUserId: targetUserId },
        { blockerId: targetUserId, blockedUserId: member.id },
      ],
    },
    select: { id: true },
  });
  if (blocked) notFound();
  const privatePreview =
    target.memberProfile?.profileVisibility === "PRIVATE" ||
    target.memberProfile?.privacyReviewRequired;
  return (
    <main className="interaction-page">
      <Link className="text-link" href="/discover">
        ← Discover
      </Link>
      <section className="interaction-panel form-panel">
        <p className="section-kicker">REQUEST A SKILL EXCHANGE</p>
        <h1>Send {target.memberProfile?.displayName || "SkillSwap Member"} a request</h1>
        {privatePreview && (
          <p className="privacy-notice">
            This member’s profile is private. Only basic profile and skill titles are shown.
          </p>
        )}
        <form action={createExchangeRequest} className="interaction-form">
          <input type="hidden" name="recipientId" value={targetUserId} />
          <label>
            Exchange type
            <select name="type">
              <option value="CREDIT_LEARNING">Credit-based learning</option>
              {target.memberProfile?.acceptDirectSwapRequests && ownSkills.length > 0 && (
                <option value="DIRECT_SWAP">Direct swap</option>
              )}
            </select>
          </label>
          <label>
            Skill you want them to teach
            <select name="targetSkillId" required>
              {targetSkills.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.priceCredits !== null && !privatePreview
                    ? " · " + s.priceCredits + " credits/session"
                    : ""}
                </option>
              ))}
            </select>
          </label>
          {ownSkills.length > 0 && (
            <label>
              Skill you can teach (for a direct swap)
              <select name="offerSkillId">
                <option value="">Choose if selecting direct swap</option>
                {ownSkills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.priceCredits !== null
                      ? ` · ${s.priceCredits} credits/session`
                      : " · set a credit value first"}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Request title
            <input
              name="title"
              minLength={5}
              maxLength={120}
              required
              placeholder="Help with beginner Spanish conversation"
            />
          </label>
          <label>
            Scope
            <textarea
              name="scope"
              minLength={10}
              maxLength={1000}
              rows={4}
              required
              placeholder="Describe the topic and your current level."
            />
          </label>
          <label>
            Expected outcome
            <textarea
              name="expectedOutcome"
              minLength={5}
              maxLength={500}
              rows={3}
              required
              placeholder="What do you hope to do after the exchange?"
            />
          </label>
          <label>
            Optional note
            <textarea
              name="message"
              maxLength={1000}
              rows={3}
              placeholder="Add a short note to the member."
            />
          </label>
          <p className="form-hint">
            If you choose a direct swap, it snapshots both teaching-skill values and quotes each
            participant’s deposit as half rounded up (minimum 1 credit). Deposits are held before
            either session time is confirmed. Credit posting is currently disabled pending policy
            approval.
          </p>
          <button className="primary-button">Send request</button>
        </form>
      </section>
    </main>
  );
}
