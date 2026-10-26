import Image from "next/image";

export default function HomePage() {
  return (
    <main className="landing-page" id="home">
      <section className="workspace">
        <header className="topbar">
          <a className="landing-brand" href="#home" aria-label="SkillSwap home">
            <Image src="/skillswap-symbol.png" alt="" width={38} height={38} priority />
            <Image className="wordmark" src="/skillswap-wordmark.png" alt="SkillSwap" width={119} height={28} priority />
          </a>
          <div className="topbar-actions">
            <span className="role-pill">Member account</span>
            <a className="topbar-link" href="/sign-in">
              Sign in
            </a>
            <a className="topbar-join" href="/sign-up">
              Join SkillSwap <span aria-hidden="true">↗</span>
            </a>
          </div>
        </header>

        <div className="content">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> FOUNDATION PHASE
          </div>
          <div className="hero-grid">
            <div className="hero-copy">
              <p className="overline">YOUR SKILLS ARE CURRENCY</p>
              <h1>
                Learn something.
                <br />
                <span>Teach something.</span>
              </h1>
              <p className="intro">
                SkillSwap brings learners and teachers together in one community. Every Member can
                share a skill and explore something new.
              </p>
              <div className="hero-actions">
                <a className="button button-primary" href="#member">
                  Explore the foundation <span aria-hidden="true">↗</span>
                </a>
                <a className="text-link" href="#admin">
                  See the Admin boundary
                </a>
              </div>
            </div>
            <div className="brand-card" aria-label="SkillSwap brand">
              <span className="card-orbit orbit-one" />
              <span className="card-orbit orbit-two" />
              <Image
                className="full-logo"
                src="/skillswap-logo.png"
                alt="SkillSwap logo with two complementary arrows"
                width={224}
                height={224}
                priority
              />
              <span className="card-caption">Share knowledge. Grow together.</span>
            </div>
          </div>

          <section aria-labelledby="member-heading" className="section" id="member">
            <div className="section-heading">
              <div>
                <p className="section-kicker">ONE MEMBER ACCOUNT</p>
                <h2 id="member-heading">Teach and learn from the same profile.</h2>
              </div>
              <span className="section-index">01 / 02</span>
            </div>
            <div className="capability-grid">
              <article className="capability-card teach-card">
                <span className="capability-tag">SHARE WHAT YOU KNOW</span>
                <div className="capability-icon" aria-hidden="true">
                  ↗
                </div>
                <h3>I can teach</h3>
                <p>List your skills, set your availability, and help someone make progress.</p>
              </article>
              <article className="capability-card learn-card">
                <span className="capability-tag">FIND WHAT YOU NEED</span>
                <div className="capability-icon" aria-hidden="true">
                  ↙
                </div>
                <h3>I want to learn</h3>
                <p>Discover people who can help you build your next skill.</p>
              </article>
            </div>
          </section>

          <section aria-labelledby="admin-heading" className="admin-banner" id="admin">
            <div className="admin-mark" aria-hidden="true">
              A
            </div>
            <div>
              <p className="section-kicker">SEPARATE OPERATIONAL ACCESS</p>
              <h2 id="admin-heading">Admin is a protected account grant.</h2>
              <p>
                Members cannot grant themselves Admin access. Authorization is enforced on the
                server.
              </p>
            </div>
            <span className="admin-lock" aria-label="Protected access">
              ⌑
            </span>
          </section>

          <footer className="page-footer">
            <span>SkillSwap · Product foundation</span>
            <span>Member and Admin access remain separate.</span>
          </footer>
        </div>
      </section>
    </main>
  );
}
