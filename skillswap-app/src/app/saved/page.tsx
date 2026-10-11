import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";

export default async function SavedPage() {
  const member = await requireMemberPage();
  const prisma = getPrismaClient();
  const [blocks, mutes, savedTeachers, followedPeople, savedSkills, followedSkills] =
    await Promise.all([
      prisma.profileBlock.findMany({
        where: { OR: [{ blockerId: member.id }, { blockedUserId: member.id }] },
        select: { blockerId: true, blockedUserId: true },
      }),
      prisma.mutedMember.findMany({
        where: { OR: [{ userId: member.id }, { mutedUserId: member.id }] },
        select: { userId: true, mutedUserId: true },
      }),
      prisma.savedTeacher.findMany({
        where: { userId: member.id },
        include: {
          teacher: {
            select: {
              id: true,
              status: true,
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
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.followedPerson.findMany({
        where: { userId: member.id },
        include: {
          person: {
            select: {
              id: true,
              status: true,
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
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.savedSkill.findMany({
        where: { userId: member.id },
        include: {
          skillListing: {
            include: {
              user: {
                select: {
                  id: true,
                  status: true,
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
              category: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.followedSkill.findMany({
        where: { userId: member.id },
        include: {
          skillListing: {
            include: {
              user: {
                select: {
                  id: true,
                  status: true,
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
              category: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
  const blocked = new Set([
    ...blocks.map((b) => (b.blockerId === member.id ? b.blockedUserId : b.blockerId)),
    ...mutes.map((m) => (m.userId === member.id ? m.mutedUserId : m.userId)),
  ]);
  const visible = (u: {
    id: string;
    status: string;
    memberProfile: { isDiscoverable: boolean; hiddenUntil: Date | null } | null;
  }) =>
    u.status === "ACTIVE" &&
    u.memberProfile?.isDiscoverable &&
    (!u.memberProfile.hiddenUntil || u.memberProfile.hiddenUntil <= new Date()) &&
    !blocked.has(u.id);
  const people = new Map<
    string,
    { id: string; name: string; saved: boolean; followed: boolean; preview: boolean }
  >();
  for (const row of savedTeachers)
    if (visible(row.teacher))
      people.set(row.teacher.id, {
        id: row.teacher.id,
        name: row.teacher.memberProfile?.displayName || "SkillSwap Member",
        saved: true,
        followed: false,
        preview:
          row.teacher.memberProfile?.profileVisibility === "PRIVATE" ||
          row.teacher.memberProfile?.privacyReviewRequired ||
          false,
      });
  for (const row of followedPeople)
    if (visible(row.person)) {
      const p = people.get(row.person.id);
      if (p) p.followed = true;
      else
        people.set(row.person.id, {
          id: row.person.id,
          name: row.person.memberProfile?.displayName || "SkillSwap Member",
          saved: false,
          followed: true,
          preview:
            row.person.memberProfile?.profileVisibility === "PRIVATE" ||
            row.person.memberProfile?.privacyReviewRequired ||
            false,
        });
    }
  const skillRows = [
    ...savedSkills.map((r) => ({ row: r, label: "Saved" })),
    ...followedSkills.map((r) => ({ row: r, label: "Followed" })),
  ];
  const skills = new Map<
    string,
    {
      id: string;
      name: string;
      category: string;
      ownerId: string;
      owner: string;
      label: string;
      preview: boolean;
    }
  >();
  for (const { row, label } of skillRows) {
    const listing = row.skillListing;
    if (!listing.isActive || !visible(listing.user)) continue;
    const old = skills.get(listing.id);
    if (old) old.label = old.label === label ? label : "Saved & followed";
    else
      skills.set(listing.id, {
        id: listing.id,
        name: listing.name,
        category: listing.category.name,
        ownerId: listing.user.id,
        owner: listing.user.memberProfile?.displayName || "SkillSwap Member",
        label,
        preview:
          listing.user.memberProfile?.profileVisibility === "PRIVATE" ||
          listing.user.memberProfile?.privacyReviewRequired ||
          false,
      });
  }
  return (
    <main className="discovery-page">
      <header className="discovery-header">
        <div>
          <p className="section-kicker">YOUR SHORTLIST</p>
          <h1>Saved &amp; followed</h1>
          <p>Your saved people, followed members, and saved or followed skills.</p>
        </div>
        <nav className="discovery-nav">
          <Link href="/discover">Discover</Link>
          <Link href="/discover/swaps">Direct swaps</Link>
          <Link href="/member">Workspace</Link>
        </nav>
      </header>
      <section className="discovery-panel">
        <h2>Members</h2>
        {people.size ? (
          <div className="saved-list">
            {[...people.values()].map((p) => (
              <article key={p.id}>
                <div>
                  <strong>{p.name}</strong>
                  <span>
                    {[p.saved && "Saved", p.followed && "Following", p.preview && "Basic preview"]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                <Link href={"/profiles/" + p.id}>View profile</Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No saved or followed members yet.</p>
        )}
      </section>
      <section className="discovery-panel">
        <h2>Skills</h2>
        {skills.size ? (
          <div className="saved-list">
            {[...skills.values()].map((s) => (
              <article key={s.id}>
                <div>
                  <strong>{s.name}</strong>
                  <span>
                    {s.category} · {s.owner} · {s.label}
                    {s.preview ? " · Basic preview" : ""}
                  </span>
                </div>
                <Link href={"/profiles/" + s.ownerId}>View member</Link>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No saved or followed skills yet.</p>
        )}
      </section>
    </main>
  );
}
