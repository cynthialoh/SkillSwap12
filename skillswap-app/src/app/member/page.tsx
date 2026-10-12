import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { getActor, requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { ensureProfileCompletionReward, getMemberCreditTotals } from "@/lib/credit-ledger";

const dashboardLinks = [
  { href: "/member", icon: "⌂", label: "Overview" },
  { href: "/discover", icon: "⌕", label: "Discover" },
  { href: "/profile/edit", icon: "✳", label: "My skills" },
  { href: "/exchanges", icon: "⇄", label: "Exchanges" },
  { href: "/wallet", icon: "◉", label: "Credits" },
  { href: "/saved", icon: "♡", label: "Saved" },
];

export default async function MemberPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const actor = await getActor();
  if (actor?.isAdmin) redirect("/admin");
  const member = await requireMemberPage();
  const profile = member.profile;
  const timezone = profile?.timezone || "UTC";
  const prisma = getPrismaClient();
  await prisma.$transaction((tx) => ensureProfileCompletionReward(tx, member.id));

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [params, totals, earnedThisMonth, completedExchanges] = await Promise.all([
    searchParams,
    prisma.$transaction((tx) => getMemberCreditTotals(tx, member.id)),
    prisma.creditLedgerEntry.aggregate({
      where: {
        account: { userId: member.id, type: "MEMBER_SPENDABLE" },
        amount: { gt: 0 },
        createdAt: { gte: monthStart },
      },
      _sum: { amount: true },
    }),
    prisma.session.count({
      where: {
        status: "COMPLETED",
        OR: [{ learnerId: member.id }, { teacherId: member.id }],
      },
    }),
  ]);

  const name = profile?.displayName?.trim().split(/\s+/)[0] || "there";
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: timezone,
    }).format(now),
  );
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  })
    .format(now)
    .toUpperCase();
  const earned = earnedThisMonth._sum.amount ?? 0;

  return (
    <main className="member-dashboard">
      <div className="member-dashboard-content">
        <header className="member-dashboard-header">
          <div className="member-date">{dateLabel}</div>
          <SignOutButton />
        </header>

        <section className="member-welcome">
          <h1>
            {greeting}, {name}
            <span aria-hidden="true"> ✦</span>
          </h1>
          <p>A little knowledge goes a long way. What will you learn today?</p>
          <Link className="member-find-skill" href="/discover">
            <span aria-hidden="true">＋</span> Find a skill to learn
          </Link>
        </section>

        {params.welcome === "credits" && (
          <p className="member-credit-welcome" role="status">
            Your profile is complete. 4 Skill Credits have been added to your wallet.
          </p>
        )}

        <section className="member-dashboard-cards" aria-label="Your SkillSwap overview">
          <article className="member-stat-card member-credit-card">
            <div className="member-stat-heading">
              <span>Skill Credit balance</span>
              <span className="member-stat-icon credit-icon" aria-hidden="true">
                ◉
              </span>
            </div>
            <div className="member-stat-value">
              <strong>{totals.spendable}</strong>
              <span>credits</span>
            </div>
            <div className="member-stat-footer">
              <span>+{earned} this month</span>
              <Link href="/wallet">
                View wallet <span aria-hidden="true">→</span>
              </Link>
            </div>
          </article>

          <article className="member-stat-card member-exchange-card">
            <div className="member-stat-heading">
              <span>Exchanges completed</span>
              <span className="member-stat-icon exchange-icon" aria-hidden="true">
                ⇄
              </span>
            </div>
            <div className="member-stat-value">
              <strong>{completedExchanges}</strong>
              <span>{completedExchanges === 1 ? "exchange" : "exchanges"}</span>
            </div>
            <div className="member-stat-footer">
              <span>Keep sharing what you know</span>
              <Link href="/exchanges">
                View exchanges <span aria-hidden="true">→</span>
              </Link>
            </div>
          </article>

          <article className="member-next-step-card">
            <div>
              <span className="section-kicker">YOUR SKILLS, YOUR WAY</span>
              <h2>Learn something new. Share something you know.</h2>
              <p>
                {profile?.learnSkills.length
                  ? `Ready to learn ${profile.learnSkills.slice(0, 2).join(" or ")}? Find a Member to get started.`
                  : "Add skills you want to learn or teach, then find your next exchange."}
              </p>
            </div>
            <Link className="secondary-button" href="/profile/edit">
              {profile?.learnSkills.length || profile?.teachSkills.length
                ? "Update my skills"
                : "Add my skills"}
            </Link>
          </article>
        </section>

        <nav className="member-bottom-nav" aria-label="Member navigation">
          {dashboardLinks.map((item, index) => (
            <Link
              aria-current={index === 0 ? "page" : undefined}
              className={index === 0 ? "active" : undefined}
              href={item.href}
              key={item.href}
            >
              <span className="member-bottom-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
