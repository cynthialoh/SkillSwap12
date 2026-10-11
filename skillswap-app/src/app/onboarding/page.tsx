import { redirect } from "next/navigation";
import Link from "next/link";
import { OnboardingForm } from "./onboarding-form";
import { getActor } from "@/lib/dal";

export default async function OnboardingPage() {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");
  if (actor.status !== "ACTIVE") redirect("/");
  if (actor.isAdmin) redirect("/admin");
  if (actor.profile?.onboardingCompletedAt) redirect("/member");

  return (
    <main className="auth-page onboarding-page">
      <section className="auth-card onboarding-card" aria-labelledby="onboarding-title">
        <Link className="auth-back" href="/">
          ← SkillSwap
        </Link>
        <p className="section-kicker">MEMBER SETUP · 1 OF 1</p>
        <h1 id="onboarding-title">Let’s make your profile yours.</h1>
        <p className="auth-intro">
          You have one Member account for both teaching and learning. Add what you can share and
          what you hope to learn.
        </p>
        <OnboardingForm name={actor.profile?.displayName ?? ""} profile={actor.profile} />
      </section>
    </main>
  );
}
