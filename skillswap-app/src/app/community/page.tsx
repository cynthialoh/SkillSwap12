import Link from "next/link";
import Image from "next/image";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  commentOnCommunityPost,
  createCommunityPost,
  muteCommunityAuthor,
  reportCommunityPost,
  toggleCommunityReaction,
  toggleCommunitySave,
} from "./actions";

type Search = Promise<{
  mode?: string;
  type?: string;
  skill?: string;
  volume?: string;
  posted?: string;
  error?: string;
  compose?: string;
}>;
const postTypes = ["TIP", "PROJECT", "PROGRESS", "TUTORIAL"] as const;

export default async function CommunityPage({ searchParams }: { searchParams: Search }) {
  const member = await requireMemberPage();
  const params = await searchParams;
  const mode = params.mode === "for-you" ? "for-you" : "following";
  const type = postTypes.includes(params.type as (typeof postTypes)[number]) ? params.type : "ALL";
  const skill = (params.skill ?? "").trim().toLowerCase().slice(0, 40);
  const volume = [10, 20, 40].includes(Number(params.volume)) ? Number(params.volume) : 20;
  const prisma = getPrismaClient();
  const [follows, followedSkills, unread] = await Promise.all([
    prisma.followedPerson.findMany({ where: { userId: member.id }, select: { personId: true } }),
    prisma.followedSkill.findMany({
      where: { userId: member.id },
      select: { skillListing: { select: { name: true } } },
    }),
    prisma.notification.count({ where: { recipientId: member.id, inApp: true, readAt: null } }),
  ]);
  const followedIds = follows.map((item) => item.personId);
  const followedSkillNames = followedSkills.map((item) => item.skillListing.name.toLowerCase());
  const followingFilter =
    mode === "following"
      ? followedIds.length || followedSkillNames.length
        ? {
            OR: [
              ...(followedIds.length ? [{ authorId: { in: followedIds } }] : []),
              ...(followedSkillNames.length
                ? [{ skillTags: { hasSome: followedSkillNames } }]
                : []),
            ],
          }
        : { id: { in: [] as string[] } }
      : {};
  const posts = await prisma.communityPost.findMany({
    where: {
      status: "PUBLISHED",
      ...(type !== "ALL" ? { type: type as (typeof postTypes)[number] } : {}),
      ...(skill ? { skillTags: { has: skill } } : {}),
      AND: [
        followingFilter,
        {
          OR: [
            { visibility: "PUBLIC" },
            { authorId: member.id },
            {
              visibility: "FOLLOWERS",
              author: { peopleFollowing: { some: { userId: member.id } } },
            },
          ],
        },
      ],
      author: {
        status: "ACTIVE",
        adminGrant: null,
        memberProfile: {
          is: {
            isDiscoverable: true,
            profileVisibility: "PUBLIC",
            OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: new Date() } }],
          },
        },
        NOT: [
          { blocksCreated: { some: { blockedUserId: member.id } } },
          { blocksReceived: { some: { blockerId: member.id } } },
          { mutedMembers: { some: { mutedUserId: member.id } } },
          { mutedByMembers: { some: { userId: member.id } } },
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: volume,
    include: {
      author: { select: { id: true, memberProfile: { select: { displayName: true } } } },
      reactions: { select: { userId: true } },
      saves: { where: { userId: member.id }, select: { userId: true } },
      media: {
        where: { communityPostId: { not: null } },
        orderBy: { createdAt: "asc" },
        take: 4,
        select: { id: true, contentType: true },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        take: 3,
        include: { user: { select: { memberProfile: { select: { displayName: true } } } } },
      },
      _count: { select: { reactions: true, comments: true } },
    },
  });
  const opportunities = await prisma.learningRequest.findMany({
    where: {
      status: "OPEN",
      ownerId: { not: member.id },
      OR: [
        { ownerId: { in: followedIds } },
        ...(followedSkillNames.length
          ? [
              {
                skillName: {
                  in: followedSkills.map((item) => item.skillListing.name),
                  mode: "insensitive" as const,
                },
              },
            ]
          : []),
      ],
      owner: {
        status: "ACTIVE",
        adminGrant: null,
        memberProfile: {
          is: {
            isDiscoverable: true,
            profileVisibility: "PUBLIC",
            OR: [{ hiddenUntil: null }, { hiddenUntil: { lte: new Date() } }],
          },
        },
        NOT: [
          { blocksCreated: { some: { blockedUserId: member.id } } },
          { blocksReceived: { some: { blockerId: member.id } } },
          { mutedMembers: { some: { mutedUserId: member.id } } },
          { mutedByMembers: { some: { userId: member.id } } },
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: {
      id: true,
      title: true,
      skillName: true,
      owner: { select: { memberProfile: { select: { displayName: true } } } },
    },
  });
  const upcoming = await prisma.session.findMany({
    where: {
      status: "CONFIRMED",
      startsAt: { gt: new Date() },
      OR: [{ learnerId: member.id }, { teacherId: member.id }],
    },
    orderBy: { startsAt: "asc" },
    take: 3,
    select: { id: true, startsAt: true, exchangeRequest: { select: { targetSkillName: true } } },
  });
  return (
    <main className="interaction-page community-page">
      <header className="interaction-header">
        <div>
          <p className="section-kicker">LEARNING COMMUNITY</p>
          <h1>Share what you’re learning</h1>
          <p>Short tips, projects, progress, and tutorials from Members.</p>
        </div>
        <nav className="interaction-nav">
          <Link href="/notifications">Notifications{unread ? ` (${unread})` : ""}</Link>
          <Link href="/notifications/preferences">Preferences</Link>
          <Link href="/community/muted">Muted Members</Link>
          <Link href="/member">Workspace</Link>
        </nav>
      </header>
      {params.posted && <p className="success-notice">Your learning post has been published.</p>}
      {params.error && (
        <p className="error-notice">
          {params.error === "post_limit"
            ? "You reached today’s post limit. Try again tomorrow."
            : params.error === "media-upload"
              ? "Your post could not be saved with its media. Please try again."
              : "Check the post details and attached files, then try again."}
        </p>
      )}
      <section className="interaction-panel form-panel">
        <div className="interaction-panel-heading">
          <div>
            <h2>Create a learning post</h2>
            <p>Keep it useful, respectful, and focused on learning.</p>
          </div>
        </div>
        <form action={createCommunityPost} className="interaction-form">
          <label>
            Post type
            <select
              name="type"
              required
              defaultValue={params.compose === "learned" ? "PROGRESS" : "TIP"}
            >
              <option value="TIP">Tip</option>
              <option value="PROJECT">Project or demo</option>
              <option value="PROGRESS">Learning progress</option>
              <option value="TUTORIAL">Tutorial</option>
            </select>
          </label>
          <label>
            Title
            <input
              name="title"
              minLength={3}
              maxLength={120}
              defaultValue={params.compose === "learned" ? "What I learned today" : ""}
              placeholder="What did you learn?"
            />
          </label>
          <label>
            What would you like to share?
            <textarea
              name="body"
              minLength={20}
              maxLength={2000}
              rows={4}
              placeholder="Write about what you learned, or attach a photo or short video."
            />
          </label>
          <label>
            Add photos or a short video (optional)
            <input
              name="media"
              type="file"
              accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
              multiple
            />
            <span className="form-hint">
              Up to 4 files, 15 MB total. Videos are limited to one per post.
            </span>
          </label>
          <label>
            Skill tags, separated by commas
            <input name="skillTags" maxLength={200} placeholder="e.g. illustration, algebra" />
          </label>
          <label>
            Who can see this?
            <select name="visibility">
              <option value="PUBLIC">All discoverable Members</option>
              <option value="FOLLOWERS">Members who follow me</option>
            </select>
          </label>
          <button className="primary-button">Publish learning post</button>
        </form>
      </section>
      <form method="get" className="interaction-panel community-filters">
        <label>
          Feed
          <select name="mode" defaultValue={mode}>
            <option value="following">Followed activity</option>
            <option value="for-you">All public learning</option>
          </select>
        </label>
        <label>
          Post type
          <select name="type" defaultValue={type}>
            <option value="ALL">All types</option>
            {postTypes.map((item) => (
              <option value={item} key={item}>
                {item.toLowerCase()}
              </option>
            ))}
          </select>
        </label>
        <label>
          Skill tag
          <input name="skill" defaultValue={skill} maxLength={40} />
        </label>
        <label>
          Activity volume
          <select name="volume" defaultValue={String(volume)}>
            <option value="10">10 posts</option>
            <option value="20">20 posts</option>
            <option value="40">40 posts</option>
          </select>
        </label>
        <button className="secondary-button">Apply filters</button>
      </form>
      <div className="community-columns">
        <section className="community-feed" aria-label="Learning posts">
          {posts.length ? (
            posts.map((post) => (
              <article className="interaction-panel community-post" id={post.id} key={post.id}>
                <header>
                  <div>
                    <p className="section-kicker">
                      {post.type.toLowerCase()} ·{" "}
                      {post.visibility === "FOLLOWERS" ? "FOLLOWERS" : "PUBLIC"}
                    </p>
                    <h2>{post.title}</h2>
                    <p>
                      By{" "}
                      <Link href={`/profiles/${post.author.id}`}>
                        {post.author.memberProfile?.displayName || "SkillSwap Member"}
                      </Link>{" "}
                      · {post.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <details>
                    <summary>More</summary>
                    <div className="post-menu">
                      <form action={muteCommunityAuthor}>
                        <input type="hidden" name="postId" value={post.id} />
                        <button className="text-link">Mute this Member</button>
                      </form>
                      <form action={reportCommunityPost}>
                        <input type="hidden" name="postId" value={post.id} />
                        <select name="category" aria-label="Report reason">
                          <option value="SPAM">Spam</option>
                          <option value="ABUSE">Abuse</option>
                          <option value="MISLEADING">Misleading</option>
                          <option value="OTHER">Other</option>
                        </select>
                        <input
                          name="details"
                          minLength={10}
                          maxLength={1000}
                          required
                          placeholder="Why report this?"
                        />
                        <button className="text-link">Report post</button>
                      </form>
                    </div>
                  </details>
                </header>
                <p className="community-post-body">{post.body}</p>
                {post.media.length > 0 && (
                  <div className="community-post-media">
                    {post.media.map((asset) =>
                      asset.contentType.startsWith("video/") ? (
                        <video
                          controls
                          playsInline
                          preload="metadata"
                          src={`/api/member-media/${asset.id}`}
                          key={asset.id}
                        />
                      ) : (
                        <Image
                          src={`/api/member-media/${asset.id}`}
                          alt="Photo shared in this learning post"
                          width={640}
                          height={480}
                          unoptimized
                          key={asset.id}
                        />
                      ),
                    )}
                  </div>
                )}
                {post.skillTags.length > 0 && (
                  <div className="community-tags">
                    {post.skillTags.map((tag) => (
                      <Link href={`/community?skill=${encodeURIComponent(tag)}`} key={tag}>
                        #{tag}
                      </Link>
                    ))}
                  </div>
                )}
                <div className="community-post-actions">
                  <form action={toggleCommunityReaction}>
                    <input type="hidden" name="postId" value={post.id} />
                    <button className="secondary-button">
                      {post.reactions.some((reaction) => reaction.userId === member.id)
                        ? "Appreciated"
                        : "Appreciate"}{" "}
                      · {post._count.reactions}
                    </button>
                  </form>
                  <form action={toggleCommunitySave}>
                    <input type="hidden" name="postId" value={post.id} />
                    <button className="secondary-button">
                      {post.saves.length ? "Saved" : "Save"}
                    </button>
                  </form>
                </div>
                {post.comments.length > 0 && (
                  <div className="community-comments">
                    {post.comments.map((comment) => (
                      <p key={comment.id}>
                        <strong>{comment.user.memberProfile?.displayName || "Member"}:</strong>{" "}
                        {comment.body}
                      </p>
                    ))}
                  </div>
                )}
                <form action={commentOnCommunityPost} className="community-comment-form">
                  <input type="hidden" name="postId" value={post.id} />
                  <label className="sr-only" htmlFor={`comment-${post.id}`}>
                    Add a comment
                  </label>
                  <input
                    id={`comment-${post.id}`}
                    name="body"
                    maxLength={1000}
                    required
                    placeholder="Add a thoughtful comment"
                  />
                  <button className="secondary-button">Comment</button>
                </form>
              </article>
            ))
          ) : (
            <p className="empty-state">
              No posts match this feed yet. Follow Members or skills in Discover, or switch to all
              public learning posts.
            </p>
          )}
        </section>
        <aside className="community-aside">
          <section className="interaction-panel">
            <p className="section-kicker">SKILL OPPORTUNITIES</p>
            <h2>Open learning requests</h2>
            {opportunities.length ? (
              opportunities.map((request) => (
                <article className="community-opportunity" key={request.id}>
                  <strong>{request.skillName}</strong>
                  <p>{request.title}</p>
                  <small>From {request.owner.memberProfile?.displayName || "Member"}</small>
                  <Link href={`/requests/${request.id}`}>View request</Link>
                </article>
              ))
            ) : (
              <p className="empty-state">
                New requests matching followed Members and skills will show here.
              </p>
            )}
          </section>
          <section className="interaction-panel">
            <p className="section-kicker">UP NEXT</p>
            <h2>Your sessions</h2>
            {upcoming.length ? (
              upcoming.map((session) => (
                <article className="community-opportunity" key={session.id}>
                  <strong>{session.exchangeRequest.targetSkillName}</strong>
                  <p>{session.startsAt?.toLocaleString()}</p>
                  <Link href={`/sessions/${session.id}`}>Open session</Link>
                </article>
              ))
            ) : (
              <p className="empty-state">No upcoming sessions.</p>
            )}
          </section>
          <p className="form-hint">
            Mutes and blocks remove activity from your feed. Report inappropriate learning posts for
            Admin review.
          </p>
        </aside>
      </div>
    </main>
  );
}
