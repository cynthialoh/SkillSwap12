import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  addLearningPlanStep,
  setLearningPlanStatus,
  setLearningPlanStepCompletion,
} from "../actions";

type Search = Promise<{ error?: string; step?: string }>;

const errors: Record<string, string> = {
  invalid_step: "Check the milestone title, details, and target date.",
  rate_limit: "You have added several milestones recently. Try again later.",
  step_limit: "A plan can have up to 30 milestones.",
};

function dateLabel(date: Date | null) {
  return date
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(date)
    : "No target date";
}

export default async function LearningPlanDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Search;
}) {
  const member = await requireMemberPage();
  const [{ planId }, query] = await Promise.all([params, searchParams]);
  const plan = await getPrismaClient().learningPlan.findFirst({
    where: { id: planId, ownerId: member.id },
    include: { steps: { orderBy: { createdAt: "asc" } } },
  });
  if (!plan) notFound();

  const completedCount = plan.steps.filter((step) => step.completedAt).length;
  const progress = plan.steps.length ? Math.round((completedCount / plan.steps.length) * 100) : 0;
  const addStep = addLearningPlanStep.bind(null, plan.id);
  const setCompletion = setLearningPlanStepCompletion.bind(null, plan.id);

  return (
    <main className="interaction-page learning-plans-page">
      <header className="interaction-header">
        <div>
          <p className="section-kicker">{plan.skillName}</p>
          <h1>{plan.title}</h1>
          <p>{plan.goal}</p>
        </div>
        <nav className="interaction-nav" aria-label="Member navigation">
          <Link href="/learning-plans">All plans</Link>
          <Link href="/member">Workspace</Link>
        </nav>
      </header>

      {query.error && errors[query.error] && (
        <p className="error-notice" role="alert">
          {errors[query.error]}
        </p>
      )}
      {query.step === "added" && (
        <p className="success-notice" role="status">
          Milestone added to your plan.
        </p>
      )}

      <section className="interaction-panel learning-plan-summary">
        <div className="learning-plan-card-heading">
          <div>
            <p className="section-kicker">PLAN PROGRESS</p>
            <h2>
              {completedCount} of {plan.steps.length} milestones complete
            </h2>
          </div>
          <span
            className={`learning-plan-status learning-plan-status-${plan.status.toLowerCase()}`}
          >
            {plan.status.toLowerCase()}
          </span>
        </div>
        <progress value={progress} max={100} aria-label={`${progress}% complete`} />
        <p>Target date: {dateLabel(plan.targetDate)}</p>
        <div className="learning-plan-status-actions">
          {plan.status !== "ACTIVE" && (
            <form action={setLearningPlanStatus}>
              <input type="hidden" name="planId" value={plan.id} />
              <input type="hidden" name="status" value="ACTIVE" />
              <button className="secondary-button" type="submit">
                Resume plan
              </button>
            </form>
          )}
          {plan.status === "ACTIVE" && (
            <form action={setLearningPlanStatus}>
              <input type="hidden" name="planId" value={plan.id} />
              <input type="hidden" name="status" value="PAUSED" />
              <button className="secondary-button" type="submit">
                Pause plan
              </button>
            </form>
          )}
          {plan.status !== "COMPLETED" &&
            plan.steps.length > 0 &&
            completedCount === plan.steps.length && (
              <form action={setLearningPlanStatus}>
                <input type="hidden" name="planId" value={plan.id} />
                <input type="hidden" name="status" value="COMPLETED" />
                <button className="primary-button" type="submit">
                  Finish learning plan
                </button>
              </form>
            )}
        </div>
      </section>

      <section className="interaction-panel">
        <h2>Milestones</h2>
        {plan.steps.length ? (
          <ol className="learning-plan-steps">
            {plan.steps.map((step, index) => (
              <li
                className={`learning-plan-step${step.completedAt ? " is-complete" : ""}`}
                key={step.id}
              >
                <div className="learning-plan-step-heading">
                  <span className="learning-plan-step-number">{index + 1}</span>
                  <div>
                    <h3>{step.title}</h3>
                    {step.details && <p>{step.details}</p>}
                    {step.targetDate && (
                      <span className="field-optional">Target: {dateLabel(step.targetDate)}</span>
                    )}
                  </div>
                </div>
                {step.reflection && (
                  <p className="learning-plan-reflection">
                    <strong>Reflection:</strong> {step.reflection}
                  </p>
                )}
                {step.completedAt ? (
                  <form action={setCompletion}>
                    <input type="hidden" name="stepId" value={step.id} />
                    <input type="hidden" name="completed" value="false" />
                    <button className="secondary-button" type="submit">
                      Reopen milestone
                    </button>
                  </form>
                ) : (
                  <form
                    action={setCompletion}
                    className="interaction-form learning-plan-reflection-form"
                  >
                    <input type="hidden" name="stepId" value={step.id} />
                    <input type="hidden" name="completed" value="true" />
                    <label>
                      What did you learn? <span className="field-optional">Optional</span>
                      <textarea name="reflection" maxLength={500} rows={2} />
                    </label>
                    <button className="primary-button" type="submit">
                      Mark complete
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-state">
            Add a first milestone, such as a concept to practice or a small project to complete.
          </p>
        )}
      </section>

      {plan.status !== "COMPLETED" && (
        <section className="interaction-panel">
          <h2>Add a milestone</h2>
          <form action={addStep} className="interaction-form learning-plan-form">
            <label>
              Milestone
              <input
                name="title"
                required
                minLength={3}
                maxLength={120}
                placeholder="Practice responsive layouts"
              />
            </label>
            <label>
              Notes <span className="field-optional">Optional</span>
              <textarea
                name="details"
                maxLength={500}
                rows={3}
                placeholder="What will you practice or make?"
              />
            </label>
            <label>
              Target date <span className="field-optional">Optional</span>
              <input name="targetDate" type="date" />
            </label>
            <button className="primary-button" type="submit">
              Add milestone
            </button>
          </form>
        </section>
      )}
      <p className="privacy-notice">
        Keep personal details and private information from other people out of learning goals and
        reflections. Only your account can view this plan.
      </p>
    </main>
  );
}
