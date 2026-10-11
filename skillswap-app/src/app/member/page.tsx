import { redirect } from "next/navigation";
import { getActor, requireMemberPage } from "@/lib/dal";
import { SignOutButton } from "@/components/sign-out-button";
import Link from "next/link";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function MemberPage() {
  const actor = await getActor();
  if (actor?.isAdmin) redirect("/admin");
  const member = await requireMemberPage();
  const profile = member.profile;
  const unreadNotifications = await getPrismaClient().notification.count({
    where: { recipientId: member.id, inApp: true, readAt: null },
  });

  return (
    <main className="auth-page member-page">
      <section className="auth-card member-card">
        <div className="member-heading">
          <div>
            <p className="section-kicker">MEMBER WORKSPACE</p>
            <h1>Welcome, {profile?.displayName}.</h1>
          </div>
          <SignOutButton />
        </div>
        <p className="auth-intro">
          Your account can teach and learn. This is your starting point for the SkillSwap community.
        </p>
        <Link className="primary-button member-profile-link" href="/profile/edit">
          Edit profile and privacy
        </Link>
        <nav className="discovery-nav member-discovery-nav" aria-label="Member tools">
          <Link href="/discover">Discover members</Link>
          <Link href="/discover/swaps">Direct swaps</Link>
          <Link href="/saved">Saved &amp; followed</Link>
          <Link href="/requests">Learning requests</Link>
          <Link href="/exchanges">Exchanges</Link>
          <Link href="/connections">Connections</Link>
          <Link href="/sessions">Sessions</Link>
          <Link href="/learning-plans">Learning plans</Link>
          <Link href="/reviews">My reviews</Link>
          <Link href="/verifications">Trust &amp; verification</Link>
          <Link href="/disputes">Disputes</Link>
          <Link href="/wallet">Credits</Link>
          <Link href="/wallet/gift">Send a gift</Link>
          <Link href="/community">Learning community</Link>
          <Link href="/notifications">
            Notifications{unreadNotifications ? ` (${unreadNotifications})` : ""}
          </Link>
        </nav>
        <div className="member-profile-grid">
          <article className="capability-card teach-card">
            <span className="capability-tag">WHAT I CAN TEACH</span>
            <h3>
              {profile?.teachSkills.length
                ? profile.teachSkills.join(" · ")
                : "Add skills when you’re ready"}
            </h3>
          </article>
          <article className="capability-card learn-card">
            <span className="capability-tag">WHAT I WANT TO LEARN</span>
            <h3>
              {profile?.learnSkills.length
                ? profile.learnSkills.join(" · ")
                : "Explore new interests"}
            </h3>
          </article>
        </div>
        <dl className="profile-details">
          <div>
            <dt>Location</dt>
            <dd>{profile?.location || "Not shared"}</dd>
          </div>
          <div>
            <dt>Time zone</dt>
            <dd>{profile?.timezone}</dd>
          </div>
          <div>
            <dt>Discovery</dt>
            <dd>{profile?.isDiscoverable ? "Visible to Members" : "Hidden from discovery"}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
