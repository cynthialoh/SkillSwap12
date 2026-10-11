import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getDirectSwapCandidates } from "@/lib/discovery";

export default async function DirectSwapsPage() {
  const member = await requireMemberPage();
  const candidates = await getDirectSwapCandidates(member.id);
  return (
    <main className="discovery-page">
      <header className="discovery-header">
        <div>
          <p className="section-kicker">TWO WAY MATCHING</p>
          <h1>Direct swap matches</h1>
          <p>
            Both Members teach one skill the other wants to learn. These are proposed skill orders;
            requests and scheduling arrive in a later phase.
          </p>
        </div>
        <nav className="discovery-nav">
          <Link href="/discover">All discovery</Link>
          <Link href="/saved">Saved &amp; followed</Link>
          <Link href="/member">Workspace</Link>
        </nav>
      </header>
      {candidates.length ? (
        <section className="swap-grid">
          {candidates.map((c) => (
            <article className="discovery-card swap-card" key={c.id}>
              <p className="section-kicker">
                {c.preview ? "BASIC PROFILE PREVIEW" : "DIRECT SWAP CANDIDATE"}
              </p>
              <h2>{c.name}</h2>
              <span className="trust-badge">Trust {c.trustLevel}</span>
              <p className="match-reason">
                <strong>Why shown:</strong> {c.reason}
              </p>
              <ol className="swap-order">
                <li>
                  <strong>{c.name}</strong> teaches <b>{c.teaches.name}</b> to you.
                </li>
                <li>
                  <strong>You</strong> teach <b>{c.learns.name}</b> to {c.name}.
                </li>
              </ol>
              <p className="form-hint">
                Suggested order: their {c.teaches.name} session first, then your {c.learns.name}{" "}
                session.
              </p>
              <Link className="primary-button" href={"/profiles/" + c.id}>
                Review member profile
              </Link>
            </article>
          ))}
        </section>
      ) : (
        <section className="discovery-panel discovery-empty">
          <h2>No direct swaps found yet</h2>
          <p>
            Add skills to both your teach and learn lists, then check again as the community grows.
          </p>
          <Link className="primary-button" href="/profile/edit">
            Update my skills
          </Link>
        </section>
      )}
    </main>
  );
}
