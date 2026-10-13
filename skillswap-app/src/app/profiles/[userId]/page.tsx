import { notFound } from "next/navigation";
import { requireMemberPage } from "@/lib/dal";
import { getProfileViewForMember } from "@/lib/profile-dto";
import { AccessRequestForm } from "@/app/profile/profile-forms";
import { blockProfile } from "@/app/profile/actions";
import { getPrismaClient } from "@/lib/db/prisma";
import Image from "next/image";
import { MemberGallery } from "@/app/profile/member-media-forms";

export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const member = await requireMemberPage();
  const { userId } = await params;
  const profile = await getProfileViewForMember(member.id, userId);
  if (!profile) notFound();
  const [reputation, ratingSummary, completedExchanges, trustPolicy, profileMedia] =
    await Promise.all([
      getPrismaClient().memberProfile.findUnique({
        where: { userId },
        select: {
          trustLevel: true,
          verifiedAt: true,
          reviewsReceived: {
            where: { isPublicVisible: true },
            orderBy: { createdAt: "desc" },
            take: 8,
            select: {
              rating: true,
              publicFeedback: true,
              createdAt: true,
              reviewer: { select: { memberProfile: { select: { displayName: true } } } },
            },
          },
        },
      }),
      getPrismaClient().review.aggregate({
        where: { revieweeId: userId, isPublicVisible: true },
        _avg: { rating: true },
        _count: { _all: true },
      }),
      getPrismaClient().session.findMany({
        where: {
          status: "COMPLETED",
          OR: [{ learnerId: userId }, { teacherId: userId }],
          exchangeRequest: {
            OR: [
              { type: "CREDIT_LEARNING" },
              {
                type: "DIRECT_SWAP",
                directSwap: { is: { status: { in: ["SETTLED", "COMPLETED_PENDING_SETTLEMENT"] } } },
              },
            ],
          },
        },
        select: { exchangeRequestId: true },
        distinct: ["exchangeRequestId"],
      }),
      getPrismaClient().trustPolicy.findUnique({ where: { id: "default" } }),
      profile.kind === "private-preview"
        ? Promise.resolve([])
        : getPrismaClient().memberMedia.findMany({
            where: { userId, communityPostId: null },
            orderBy: { createdAt: "desc" },
            take: 12,
            select: { id: true, contentType: true },
          }),
    ]);
  const profileImage = await getPrismaClient().memberProfile.findUnique({
    where: { userId },
    select: { profileImageObjectKey: true },
  });
  const currentTrustLevel = reputation?.trustLevel ?? 1;
  const trustThresholds = [
    0,
    trustPolicy?.level2CompletedExchanges ?? 3,
    trustPolicy?.level3CompletedExchanges ?? 10,
    trustPolicy?.level4CompletedExchanges ?? 25,
  ];
  const nextTrustThreshold = currentTrustLevel < 4 ? trustThresholds[currentTrustLevel] : null;

  return (
    <main className="profile-settings public-profile-page">
      <a className="text-link" href="/member">
        ← Member workspace
      </a>
      <section className="settings-panel public-profile-card">
        <p className="section-kicker">SKILLSWAP MEMBER · JOINED {profile.joinedYear}</p>
        {profile.kind !== "private-preview" && profileImage?.profileImageObjectKey && (
          <Image
            className="public-member-avatar"
            src={`/api/member-avatar/${userId}`}
            width={96}
            height={96}
            unoptimized
            alt={`${profile.displayName}'s profile picture`}
          />
        )}
        <h1>{profile.displayName}</h1>
        <div className="profile-contact-actions">
          <a className="primary-button" href={`/exchanges/new?targetUserId=${profile.userId}`}>
            Send learning or swap request
          </a>
          {profile.userId !== member.id && (
            <a className="secondary-button" href={`/wallet/gift?to=${profile.userId}`}>
              Send credits
            </a>
          )}
          <a className="secondary-button" href={`/safety/report?reportedUserId=${profile.userId}`}>
            Report member
          </a>
        </div>
        {reputation && (
          <section className="reputation-panel" aria-label="Member reputation">
            <h2>Trust and feedback</h2>
            <p>
              Trust Level {reputation.trustLevel} · {ratingSummary._count._all} session rating
              {ratingSummary._count._all === 1 ? "" : "s"}· {completedExchanges.length} completed
              exchange{completedExchanges.length === 1 ? "" : "s"}
              {ratingSummary._avg.rating !== null
                ? ` · ${ratingSummary._avg.rating.toFixed(1)} / 5 average`
                : ""}
              {reputation.verifiedAt ? " · SkillSwap verified" : ""}
            </p>
            {nextTrustThreshold !== null && (
              <p className="form-hint">
                Trust progress: {Math.min(completedExchanges.length, nextTrustThreshold)} of{" "}
                {nextTrustThreshold} completed exchanges toward Level {currentTrustLevel + 1}.
              </p>
            )}
            {reputation.reviewsReceived.filter((review) => review.publicFeedback).length > 0 && (
              <ul className="review-list">
                {reputation.reviewsReceived
                  .filter((review) => review.publicFeedback)
                  .map((review) => (
                    <li key={`${review.createdAt.toISOString()}-${review.rating}`}>
                      <strong>{review.rating} / 5</strong>
                      <p>{review.publicFeedback}</p>
                      <span>
                        {review.reviewer.memberProfile?.displayName || "SkillSwap Member"} ·{" "}
                        {review.createdAt.toLocaleDateString()}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </section>
        )}
        {profileMedia.length > 0 && (
          <section className="reputation-panel">
            <h2>Photos and videos</h2>
            <MemberGallery items={profileMedia} />
          </section>
        )}
        {profile.kind === "private-preview" ? (
          <>
            <p className="privacy-notice">
              This member keeps their full profile private. You can see a basic preview and request
              access.
            </p>
            <div className="skill-chip-list">
              {profile.skills.map((skill) => (
                <span className="skill-chip" key={skill.id}>
                  {skill.direction === "TEACH" ? "Teaches" : "Learns"}: {skill.name}
                </span>
              ))}
            </div>
            {profile.canRequestAccess ? (
              <AccessRequestForm ownerId={profile.userId} />
            ) : (
              <p className="form-hint">
                {profile.accessRequestStatus === "PENDING"
                  ? "Your request is waiting for the member."
                  : profile.accessRequestStatus === "APPROVED"
                    ? "You have access. Reload this page to view the full profile."
                    : "A previous access request was not approved."}
              </p>
            )}
          </>
        ) : (
          <>
            {profile.about && <p className="profile-about">{profile.about}</p>}
            {profile.location && <p className="profile-location">{profile.location}</p>}
            {profile.kind === "approved-private" && profile.availability && (
              <p className="form-hint">Availability: {profile.availability}</p>
            )}
            <div className="profile-skill-columns">
              {(["TEACH", "LEARN"] as const).map((direction) => {
                const listings = direction === "TEACH" ? profile.teachSkills : profile.learnSkills;
                return (
                  <section className="profile-skill-group" key={direction}>
                    <h2>{direction === "TEACH" ? "Can teach" : "Wants to learn"}</h2>
                    {listings.length ? (
                      listings.map((skill) => (
                        <article className="profile-skill" key={skill.id}>
                          <h3>{skill.name}</h3>
                          <p>
                            {skill.category} · {skill.experienceLevel.toLowerCase()}
                            {skill.yearsExperience ? ` · ${skill.yearsExperience} years` : ""}
                          </p>
                          {skill.topics.length > 0 && <p>{skill.topics.join(" · ")}</p>}
                          {skill.outcome && <p>{skill.outcome}</p>}
                          {direction === "TEACH" && skill.priceCredits !== null && (
                            <p>{skill.priceCredits} credits / session</p>
                          )}
                        </article>
                      ))
                    ) : (
                      <p className="empty-state">No listings yet.</p>
                    )}
                  </section>
                );
              })}
            </div>
          </>
        )}
        <form action={blockProfile} className="block-profile-form">
          <input type="hidden" name="userId" value={profile.userId} />
          <button className="text-button danger-text">Block this member</button>
        </form>
      </section>
    </main>
  );
}
