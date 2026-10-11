import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { cleanDiscoveryInput, getDiscoveryData } from "@/lib/discovery";
import {
  dismissRecommendation,
  resetDiscoveryPreferences,
  toggleFollowPerson,
  toggleFollowSkill,
  toggleSavedSkill,
  toggleSavedTeacher,
  updateDiscoveryPreferences,
} from "./actions";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const member = await requireMemberPage();
  const params = await searchParams;
  const input = cleanDiscoveryInput(params);
  const { cards, total, pages, categories, preferences } = await getDiscoveryData(member.id, input);
  return (
    <main className="discovery-page">
      <header className="discovery-header">
        <div>
          <p className="section-kicker">SKILLSWAP COMMUNITY</p>
          <h1>Find your next skill swap</h1>
          <p>
            Browse members and skills. Recommendations include a short reason so you can choose for
            yourself.
          </p>
        </div>
        <nav className="discovery-nav">
          <Link href="/member">Workspace</Link>
          <Link href="/discover/swaps">Direct swaps</Link>
          <Link href="/saved">Saved &amp; followed</Link>
          <Link href="/profile/edit">Profile</Link>
        </nav>
      </header>
      {params.error === "rate_limit" && (
        <p className="error-notice">
          You’re following items quickly. Please wait a few minutes and try again.
        </p>
      )}
      <section className="discovery-panel">
        <h2>Search members and skills</h2>
        <form className="discovery-filters" action="/discover">
          <label>
            Search
            <input name="q" defaultValue={input.q} placeholder="e.g. Spanish, design, Python" />
          </label>
          <label>
            Category
            <select name="category" defaultValue={input.category}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Skill direction
            <select name="direction" defaultValue={input.direction}>
              <option value="">Any direction</option>
              <option value="TEACH">Can teach</option>
              <option value="LEARN">Wants to learn</option>
            </select>
          </label>
          <label>
            Experience
            <select name="level" defaultValue={input.level}>
              <option value="">Any level</option>
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
              <option value="EXPERT">Expert</option>
            </select>
          </label>
          <label>
            Sort
            <select name="sort" defaultValue={input.sort}>
              <option value="recommended">Recommended</option>
              <option value="recent">Recently joined</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
          <label className="filter-check">
            <input type="checkbox" name="verified" defaultChecked={input.verified} /> Verified
            skills
          </label>
          <label className="filter-check">
            <input type="checkbox" name="recent" defaultChecked={input.recent} /> Active in the last
            30 days
          </label>
          <label className="filter-check">
            <input type="checkbox" name="availability" defaultChecked={input.availability} />{" "}
            Availability details shared
          </label>
          <button className="primary-button" type="submit">
            Apply filters
          </button>
          <Link className="text-link" href="/discover">
            Clear
          </Link>
        </form>
        <div className="category-pills">
          <span>Browse categories</span>
          {categories.map((c) => (
            <Link key={c.slug} href={"/discover?category=" + encodeURIComponent(c.slug)}>
              {c.name}
            </Link>
          ))}
        </div>
      </section>
      <details className="discovery-panel preference-panel">
        <summary>Recommendation and trust preferences</summary>
        <p>
          Choose whether recommendations use your discovery settings. Your stated skills and search
          filters remain available in every mode.
        </p>
        <form action={updateDiscoveryPreferences} className="discovery-preferences">
          <label>
            Personalization
            <select name="mode" defaultValue={preferences.personalizationMode}>
              <option value="ACTIVE">Active</option>
              <option value="PAUSED">Paused</option>
              <option value="OFF">Off</option>
            </select>
          </label>
          <label>
            Minimum Trust Level
            <input
              type="number"
              name="minimumTrustLevel"
              min="1"
              max="10"
              defaultValue={preferences.minimumTrustLevel}
            />
          </label>
          <label>
            Minimum for direct swaps
            <input
              type="number"
              name="minimumDirectSwapTrust"
              min="1"
              max="10"
              defaultValue={preferences.minimumDirectSwapTrust}
            />
          </label>
          <label className="filter-check">
            <input
              type="checkbox"
              name="useTrustLevel"
              defaultChecked={preferences.useTrustLevel}
            />{" "}
            Include Trust Level in match relevance
          </label>
          <button className="primary-button" type="submit">
            Save preferences
          </button>
        </form>
        <form action={resetDiscoveryPreferences}>
          <button className="text-button">Reset recommendation preferences</button>
        </form>
      </details>
      <section className="discovery-results">
        <div className="discovery-results-heading">
          <h2>Members for you</h2>
          <span>{total} results</span>
        </div>
        {cards.length ? (
          <div className="discovery-grid">
            {cards.map((card) => (
              <article className="discovery-card" key={card.id}>
                <div className="discovery-card-top">
                  <div>
                    <p className="section-kicker">
                      {card.kind === "preview" ? "BASIC PROFILE PREVIEW" : "MEMBER"} · JOINED{" "}
                      {card.joinedYear}
                    </p>
                    <h3>{card.name}</h3>
                  </div>
                  <span className="trust-badge">Trust {card.trustLevel}</span>
                </div>
                {card.location && <p className="discovery-location">{card.location}</p>}
                {card.availabilityListed && (
                  <p className="discovery-location">Availability details shared</p>
                )}
                {card.recentlyActive && (
                  <p className="discovery-location">Active in the last 30 days</p>
                )}
                {card.bio && <p className="discovery-bio">{card.bio}</p>}
                <p className="match-reason">
                  <strong>Why shown:</strong> {card.reason}
                </p>
                <div className="discovery-skills">
                  {card.skills.map((skill) => (
                    <div className="discovery-skill" key={skill.id}>
                      <div>
                        <span
                          className={
                            skill.direction === "TEACH"
                              ? "skill-direction teach"
                              : "skill-direction learn"
                          }
                        >
                          {skill.direction === "TEACH" ? "Teaches" : "Learns"}
                        </span>
                        <strong>{skill.name}</strong>
                        <small>
                          {skill.category}
                          {skill.level ? " · " + skill.level.toLowerCase() : ""}
                          {skill.verified ? " · Verified" : ""}
                        </small>
                      </div>
                      <div className="mini-actions">
                        <form action={toggleSavedSkill}>
                          <input type="hidden" name="listingId" value={skill.id} />
                          <button
                            className="text-button"
                            aria-label={skill.saved ? "Remove saved skill" : "Save skill"}
                          >
                            {skill.saved ? "Unsave" : "Save skill"}
                          </button>
                        </form>
                        <form action={toggleFollowSkill}>
                          <input type="hidden" name="listingId" value={skill.id} />
                          <button
                            className="text-button"
                            aria-label={skill.followed ? "Unfollow skill" : "Follow skill"}
                          >
                            {skill.followed ? "Unfollow" : "Follow"}
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="discovery-card-actions">
                  <Link className="primary-button" href={"/profiles/" + card.id}>
                    View profile
                  </Link>
                  <form action={toggleSavedTeacher}>
                    <input type="hidden" name="targetId" value={card.id} />
                    <button className="secondary-button">
                      {card.saved ? "Remove saved member" : "Save member"}
                    </button>
                  </form>
                  <form action={toggleFollowPerson}>
                    <input type="hidden" name="targetId" value={card.id} />
                    <button className="secondary-button">
                      {card.followed ? "Unfollow" : "Follow member"}
                    </button>
                  </form>
                </div>
                <form action={dismissRecommendation} className="dismiss-form">
                  <input type="hidden" name="targetId" value={card.id} />
                  <label>
                    Hide this recommendation
                    <input name="reason" maxLength={250} placeholder="Optional reason" />
                  </label>
                  <button className="text-button">Dismiss</button>
                </form>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state discovery-empty">
            <h3>No matching members yet</h3>
            <p>Try removing a filter or search for another skill.</p>
          </div>
        )}
        {pages > 1 && (
          <nav className="pagination" aria-label="Search result pages">
            {input.page! > 1 && <Link href={pageHref(input, input.page! - 1)}>Previous</Link>}
            <span>
              Page {input.page} of {pages}
            </span>
            {input.page! < pages && <Link href={pageHref(input, input.page! + 1)}>Next</Link>}
          </nav>
        )}
      </section>
    </main>
  );
}
function pageHref(input: ReturnType<typeof cleanDiscoveryInput>, page: number) {
  const query = new URLSearchParams();
  if (input.q) query.set("q", input.q);
  if (input.category) query.set("category", input.category);
  if (input.direction) query.set("direction", input.direction);
  if (input.level) query.set("level", input.level);
  if (input.sort && input.sort !== "recommended") query.set("sort", input.sort);
  if (input.verified) query.set("verified", "on");
  if (input.recent) query.set("recent", "on");
  if (input.availability) query.set("availability", "on");
  query.set("page", String(page));
  return "/discover?" + query.toString();
}
