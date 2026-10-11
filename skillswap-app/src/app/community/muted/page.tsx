import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { unmuteCommunityMember } from "../actions";

export default async function MutedCommunityMembersPage() {
  const member = await requireMemberPage();
  const muted = await getPrismaClient().mutedMember.findMany({
    where: { userId: member.id },
    orderBy: { createdAt: "desc" },
    include: {
      mutedUser: { select: { id: true, memberProfile: { select: { displayName: true } } } },
    },
  });
  return (
    <main className="interaction-page">
      <Link className="text-link" href="/community">
        ← Learning community
      </Link>
      <section className="interaction-panel">
        <p className="section-kicker">YOUR COMMUNITY CONTROLS</p>
        <h1>Muted Members</h1>
        <p>
          Muted Members’ posts, recommendations, and optional activity notices are hidden from you.
          They are not told that you muted them.
        </p>
        {muted.length ? (
          <div className="ledger-list">
            {muted.map((entry) => (
              <article className="ledger-row" key={entry.mutedUserId}>
                <div>
                  <strong>
                    {entry.mutedUser.memberProfile?.displayName || "SkillSwap Member"}
                  </strong>
                  <small>Muted {entry.createdAt.toLocaleDateString()}</small>
                </div>
                <form action={unmuteCommunityMember}>
                  <input type="hidden" name="mutedUserId" value={entry.mutedUserId} />
                  <button className="secondary-button">Unmute</button>
                </form>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">You have not muted any Members.</p>
        )}
      </section>
    </main>
  );
}
