import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { getSelfProfileForMember } from "@/lib/profile-dto";
import { ProfileSettingsForm, SkillListingForm } from "../profile-forms";
import {
  deleteSkillListing,
  hideProfileForThreeMonths,
  manageAccessRequest,
  requestSkillVerification,
  restoreProfileEarly,
  unblockProfile,
} from "../actions";

export default async function EditProfilePage() {
  const member = await requireMemberPage();
  const prisma = getPrismaClient();
  const [profile, categories, requests, blocks] = await Promise.all([
    getSelfProfileForMember(member.id),
    prisma.skillCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.profileAccessRequest.findMany({
      where: { ownerId: member.id, status: { in: ["PENDING", "APPROVED"] } },
      include: {
        requester: { select: { id: true, memberProfile: { select: { displayName: true } } } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.profileBlock.findMany({
      where: { blockerId: member.id },
      include: {
        blockedUser: { select: { id: true, memberProfile: { select: { displayName: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!profile)
    return (
      <main className="profile-settings">
        <p>Profile not found.</p>
      </main>
    );
  const profileChecks = [
    Boolean(profile.displayName),
    Boolean(profile.bio),
    Boolean(profile.location),
    profile.skills.some((skill) => skill.direction === "TEACH"),
    profile.skills.some((skill) => skill.direction === "LEARN"),
  ];
  const completeness = Math.round(
    (profileChecks.filter(Boolean).length / profileChecks.length) * 100,
  );

  return (
    <main className="profile-settings">
      <div className="profile-page-heading">
        <div>
          <BackButton fallbackHref="/member" />
          <p className="section-kicker">YOUR MEMBER PROFILE</p>
          <h1>Profile &amp; privacy</h1>
          <p>Manage what other members see and the skills you share.</p>
        </div>
        <Link className="text-link" href="/member">
          Back to workspace
        </Link>
      </div>
      <section className="settings-panel completeness-panel">
        <div>
          <h2>Profile completeness</h2>
          <p>
            {completeness}% complete · Add a short introduction, location, and both teach and learn
            skills to help members understand what you offer.
          </p>
        </div>
        <div
          className="completeness-track"
          role="progressbar"
          aria-label="Profile completeness"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={completeness}
        >
          <span style={{ width: `${completeness}%` }} />
        </div>
      </section>
      <section className="settings-panel">
        <h2>Profile details and privacy</h2>
        <ProfileSettingsForm profile={profile} />
      </section>
      <section className="settings-panel hide-panel">
        <div>
          <h2>Take a break from discovery</h2>
          <p>
            Hide your profile for three months. Existing activity remains available. When it
            returns, review your visibility settings.
          </p>
        </div>
        {profile.hiddenUntil && profile.hiddenUntil > new Date() ? (
          <>
            <p className="privacy-notice">
              Your profile is hidden until {profile.hiddenUntil.toLocaleDateString()}.
            </p>
            <form action={restoreProfileEarly}>
              <button className="secondary-button">Restore profile early</button>
            </form>
          </>
        ) : (
          <form action={hideProfileForThreeMonths}>
            <button className="secondary-button">Hide for 3 months</button>
          </form>
        )}
      </section>
      <section className="settings-panel">
        <h2>Your skills</h2>
        <p className="form-hint">
          Add teaching skills and learning goals to the same profile. Credit balance is never
          displayed here.
        </p>
        <div className="skill-list">
          {profile.skills.map((skill) => (
            <article className="skill-row" key={skill.id}>
              <div>
                <span className={`skill-direction ${skill.direction.toLowerCase()}`}>
                  {skill.direction === "TEACH" ? "TEACH" : "LEARN"}
                </span>
                <h3>{skill.name}</h3>
                <p>
                  {skill.category} · {skill.experienceLevel.toLowerCase()} · {skill.yearsExperience}{" "}
                  years
                </p>
                {skill.topics.length > 0 && <p>{skill.topics.join(" · ")}</p>}
                {skill.direction === "TEACH" && skill.priceCredits !== null && (
                  <p>{skill.priceCredits} credits per session</p>
                )}
                <p className="verification-state">
                  Verification: {skill.verificationStatus.toLowerCase().replaceAll("_", " ")}
                </p>
              </div>
              <div className="skill-row-actions">
                <details>
                  <summary>Edit</summary>
                  <SkillListingForm categories={categories} listing={skill} />
                </details>
                {skill.verificationStatus !== "APPROVED" && (
                  <form action={requestSkillVerification}>
                    <input type="hidden" name="listingId" value={skill.id} />
                    <button className="text-button">Request verification</button>
                  </form>
                )}
                <form action={deleteSkillListing}>
                  <input type="hidden" name="listingId" value={skill.id} />
                  <button className="text-button danger-text">Remove</button>
                </form>
              </div>
            </article>
          ))}
        </div>
        <details className="add-skill">
          <summary>+ Add a skill</summary>
          <SkillListingForm categories={categories} />
        </details>
      </section>
      <section className="settings-panel">
        <h2>Profile access requests</h2>
        <p className="form-hint">
          Approve requests to show the full profile, or ignore, decline, revoke access, or block a
          member.
        </p>
        {requests.length ? (
          <div className="request-list">
            {requests.map((request) => (
              <article className="request-row" key={request.id}>
                <div>
                  <h3>{request.requester.memberProfile?.displayName || "SkillSwap Member"}</h3>
                  <p>Status: {request.status.toLowerCase()}</p>
                  {request.reason && <p>“{request.reason}”</p>}
                </div>
                <div className="request-actions">
                  {request.status === "PENDING" && (
                    <>
                      {["APPROVED", "DECLINED", "IGNORED", "BLOCK"].map((decision) => (
                        <form action={manageAccessRequest} key={decision}>
                          <input type="hidden" name="requestId" value={request.id} />
                          <input type="hidden" name="decision" value={decision} />
                          <button
                            className={
                              decision === "APPROVED" ? "small-primary" : "small-secondary"
                            }
                          >
                            {decision.toLowerCase()}
                          </button>
                        </form>
                      ))}
                    </>
                  )}
                  {request.status === "APPROVED" && (
                    <>
                      {["REVOKE", "BLOCK"].map((decision) => (
                        <form action={manageAccessRequest} key={decision}>
                          <input type="hidden" name="requestId" value={request.id} />
                          <input type="hidden" name="decision" value={decision} />
                          <button className="small-secondary">{decision.toLowerCase()}</button>
                        </form>
                      ))}
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No profile access requests yet.</p>
        )}
      </section>
      <section className="settings-panel">
        <h2>Blocked members</h2>
        {blocks.length ? (
          <div className="blocked-list">
            {blocks.map((block) => (
              <div className="blocked-row" key={block.id}>
                <span>{block.blockedUser.memberProfile?.displayName || "SkillSwap Member"}</span>
                <form action={unblockProfile}>
                  <input type="hidden" name="userId" value={block.blockedUser.id} />
                  <button className="text-button">Unblock</button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-state">You have not blocked anyone.</p>
        )}
      </section>
    </main>
  );
}
