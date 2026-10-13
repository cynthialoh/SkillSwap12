import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";

const PAGE_SIZE = 12;

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const member = await requireMemberPage();
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(1000, Number(params.page) || 1));
  const prisma = getPrismaClient();
  const [blocks, mutes] = await Promise.all([
    prisma.profileBlock.findMany({
      where: { OR: [{ blockerId: member.id }, { blockedUserId: member.id }] },
      select: { blockerId: true, blockedUserId: true },
    }),
    prisma.mutedMember.findMany({
      where: { OR: [{ userId: member.id }, { mutedUserId: member.id }] },
      select: { userId: true, mutedUserId: true },
    }),
  ]);
  const excluded = [
    ...blocks.map((block) =>
      block.blockerId === member.id ? block.blockedUserId : block.blockerId,
    ),
    ...mutes.map((mute) => (mute.userId === member.id ? mute.mutedUserId : mute.userId)),
  ];
  const where: Prisma.UserWhereInput = {
    id: { not: member.id, notIn: excluded },
    status: "ACTIVE",
    adminGrant: null,
    authUser: { is: { emailVerified: true } },
    memberProfile: {
      is: {
        isDiscoverable: true,
        onboardingCompletedAt: { not: null },
        OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: new Date() } }],
      },
    },
    ...(query
      ? {
          OR: [
            {
              memberProfile: {
                is: {
                  displayName: { contains: query, mode: "insensitive" },
                },
              },
            },
            {
              skillListings: {
                some: {
                  isActive: true,
                  name: { contains: query, mode: "insensitive" },
                },
              },
            },
          ],
        }
      : {}),
  };
  const [members, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        createdAt: true,
        memberProfile: {
          select: {
            displayName: true,
            bio: true,
            location: true,
            profileVisibility: true,
            privacyReviewRequired: true,
            teachSkills: true,
            learnSkills: true,
            trustLevel: true,
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="discovery-page members-page">
      <header className="discovery-header">
        <div>
          <p className="section-kicker">SKILLSWAP COMMUNITY</p>
          <h1>Meet the members</h1>
          <p>Browse members who have chosen to be discoverable and view their public profiles.</p>
        </div>
        <nav className="discovery-nav" aria-label="Member directory navigation">
          <Link href="/discover">Find skills</Link>
          <Link href="/connections">Chat</Link>
          <Link href="/member">Workspace</Link>
        </nav>
      </header>

      <section className="discovery-panel">
        <h2>Member directory</h2>
        <form className="discovery-filters members-search" action="/members">
          <label>
            Search by member name or skill
            <input
              name="q"
              defaultValue={query}
              maxLength={80}
              placeholder="e.g. Alex or photography"
            />
          </label>
          <button className="primary-button" type="submit">
            Search members
          </button>
          {query && (
            <Link className="text-link" href="/members">
              Clear search
            </Link>
          )}
        </form>
        <p className="form-hint">
          {total} {total === 1 ? "member" : "members"} available to browse. Private profiles show
          only a limited preview; hidden, blocked, and muted members are excluded.
        </p>
      </section>

      {members.length ? (
        <section className="discovery-results" aria-label="Members">
          <div className="discovery-grid">
            {members.map((person) => {
              const profile = person.memberProfile!;
              const privatePreview =
                profile.profileVisibility === "PRIVATE" || profile.privacyReviewRequired;
              const skills = privatePreview
                ? []
                : [
                    ...profile.teachSkills.map((skill) => ({ skill, direction: "Can teach" })),
                    ...profile.learnSkills.map((skill) => ({ skill, direction: "Wants to learn" })),
                  ];
              return (
                <article className="discovery-card member-directory-card" key={person.id}>
                  <div className="discovery-card-top">
                    <div>
                      <p className="section-kicker">
                        MEMBER · JOINED {person.createdAt.getUTCFullYear()}
                      </p>
                      <h2>{profile.displayName?.trim() || "SkillSwap Member"}</h2>
                    </div>
                    <span className="trust-badge">Trust {profile.trustLevel}</span>
                  </div>
                  {privatePreview ? (
                    <p className="discovery-bio">This member shares a limited profile preview.</p>
                  ) : (
                    <>
                      {profile.location && <p className="discovery-location">{profile.location}</p>}
                      {profile.bio && <p className="discovery-bio">{profile.bio}</p>}
                      {skills.length > 0 && (
                        <div className="member-directory-skills">
                          {skills.slice(0, 6).map(({ skill, direction }) => (
                            <span className="skill-chip" key={`${direction}-${skill}`}>
                              {direction}: {skill}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <div className="discovery-card-actions">
                    <Link className="primary-button" href={`/profiles/${person.id}`}>
                      View profile
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
          {pages > 1 && (
            <nav className="pagination" aria-label="Member directory pages">
              {page > 1 && <Link href={pageHref(query, page - 1)}>Previous</Link>}
              <span>
                Page {page} of {pages}
              </span>
              {page < pages && <Link href={pageHref(query, page + 1)}>Next</Link>}
            </nav>
          )}
        </section>
      ) : (
        <section className="empty-state discovery-empty">
          <h2>{query ? "No members found" : "No members to show yet"}</h2>
          <p>
            {query
              ? "Try a different name or skill."
              : "Members will appear here after they complete their profile and choose to be discoverable."}
          </p>
        </section>
      )}
    </main>
  );
}

function pageHref(query: string, page: number) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("page", String(page));
  return `/members?${params.toString()}`;
}
