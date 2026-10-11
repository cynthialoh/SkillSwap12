import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { createLearningPlan } from "./actions";

type Search = Promise<{ error?: string }>;

const errorMessage: Record<string, string> = {
  invalid_plan: "Check the plan title, skill, goal, and target date.",
  rate_limit: "You have created several plans recently. Try again later.",
};

function dateLabel(date: Date | null) {
  return date
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date)
    : "No target date";
}

export default async function LearningPlansPage({ searchParams }: { searchParams: Search }) {
  const member = await requireMemberPage();
  const params = await searchParams;
  const plans = await getPrismaClient().learningPlan.findMany({
    where: { ownerId: member.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      skillName: true,
      goal: true,
      targetDate: true,
      status: true,
      steps: { select: { completedAt: true } },
    },
  });

  return (
    <main className="interaction-page learning-plans-page">
      <header className="interaction-header">
        <div>
          <p className="section-kicker">YOUR LEARNING JOURNEY</p>
          <h1>Learning plans</h1>
          <p>Turn a skill you want to learn into clear milestones and track what you discover.</p>
        </div>
        <nav className="interaction-nav" aria-label="Member navigation">
          <Link href="/member">Workspace</Link>
          <Link href="/discover">Discover Members</Link>
          <Link href="/community">Learning community</Link>
        </nav>
      </header>

      {params.error && errorMessage[params.error] && (
        <p className="error-notice" role="alert">
          {errorMessage[params.error]}
        </p>
      )}

      <section className="interaction-panel learning-plan-create-panel">
        <h2>Start a plan</h2>
        <p>
          Keep plans personal. Only you can view or update your goals, milestones, and reflections.
        </p>
        <form action={createLearningPlan} className="interaction-form learning-plan-form">
          <label>
            Plan title
            <input
              name="title"
              required
              minLength={3}
              maxLength={120}
              placeholder="Build my first web app"
            />
          </label>
          <label>
            Skill
            <input
              name="skillName"
              required
              minLength={2}
              maxLength={100}
              placeholder="Web development"
            />
          </label>
          <label>
            Learning goal
            <textarea
              name="goal"
              required
              minLength={10}
              maxLength={700}
              rows={3}
              placeholder="What do you want to be able to do?"
            />
          </label>
          <label>
            Target date <span className="field-optional">Optional</span>
            <input name="targetDate" type="date" />
          </label>
          <button className="primary-button" type="submit">
            Create learning plan
          </button>
        </form>
      </section>

      <section className="interaction-panel">
        <div className="interaction-panel-heading">
          <h2>Your plans</h2>
          <span>{plans.length} shown</span>
        </div>
        {plans.length ? (
          <div className="learning-plan-list">
            {plans.map((plan) => {
              const completed = plan.steps.filter((step) => step.completedAt).length;
              const progress = plan.steps.length
                ? Math.round((completed / plan.steps.length) * 100)
                : 0;
              return (
                <article className="learning-plan-card" key={plan.id}>
                  <div className="learning-plan-card-heading">
                    <div>
                      <p className="section-kicker">{plan.skillName}</p>
                      <h3>
                        <Link href={`/learning-plans/${plan.id}`}>{plan.title}</Link>
                      </h3>
                    </div>
                    <span
                      className={`learning-plan-status learning-plan-status-${plan.status.toLowerCase()}`}
                    >
                      {plan.status.toLowerCase()}
                    </span>
                  </div>
                  <p>{plan.goal}</p>
                  <div className="learning-plan-progress-row">
                    <span>
                      {completed} of {plan.steps.length} milestones
                    </span>
                    <span>{dateLabel(plan.targetDate)}</span>
                  </div>
                  <progress value={progress} max={100} aria-label={`${progress}% complete`} />
                </article>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">
            Your first plan can be small. Choose one skill and a goal you can work toward.
          </p>
        )}
      </section>
      <p className="privacy-notice">
        Learning plans are private to your Member account. They are not shared in profiles,
        discovery, or community posts.
      </p>
    </main>
  );
}
