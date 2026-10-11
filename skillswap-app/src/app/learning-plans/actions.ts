"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { LearningPlanStatus } from "@/generated/prisma/client";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { consumeRateLimit, InteractionError } from "@/lib/interaction-policy";

const field = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
const statuses: LearningPlanStatus[] = ["ACTIVE", "PAUSED", "COMPLETED"];

function parseDate(value: string) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value
    ? undefined
    : parsed;
}

async function ownedPlan(planId: string, ownerId: string) {
  if (!planId || planId.length > 40) return null;
  return getPrismaClient().learningPlan.findFirst({
    where: { id: planId, ownerId },
    select: { id: true, ownerId: true, status: true },
  });
}

export async function createLearningPlan(data: FormData) {
  const member = await requireMember();
  const title = field(data, "title");
  const skillName = field(data, "skillName");
  const goal = field(data, "goal");
  const targetDateInput = field(data, "targetDate");
  const targetDate = parseDate(targetDateInput);
  if (
    title.length < 3 ||
    title.length > 120 ||
    skillName.length < 2 ||
    skillName.length > 100 ||
    goal.length < 10 ||
    goal.length > 700 ||
    targetDate === undefined ||
    (targetDate && targetDate < new Date(new Date().toISOString().slice(0, 10)))
  ) {
    redirect("/learning-plans?error=invalid_plan");
  }
  try {
    await consumeRateLimit(member.id, "learning-plan-create", 5, 60 * 60 * 1000);
  } catch (error) {
    if (error instanceof InteractionError) redirect("/learning-plans?error=rate_limit");
    throw error;
  }
  const plan = await getPrismaClient().learningPlan.create({
    data: { ownerId: member.id, title, skillName, goal, targetDate },
    select: { id: true },
  });
  revalidatePath("/member");
  revalidatePath("/learning-plans");
  redirect(`/learning-plans/${plan.id}`);
}

export async function addLearningPlanStep(planId: string, data: FormData) {
  const member = await requireMember();
  const plan = await ownedPlan(planId, member.id);
  if (!plan) throw new InteractionError("This learning plan is unavailable.");
  if (plan.status === "COMPLETED")
    throw new InteractionError("Reopen this plan before adding another milestone.");
  const title = field(data, "title");
  const details = field(data, "details");
  const targetDateInput = field(data, "targetDate");
  const targetDate = parseDate(targetDateInput);
  if (title.length < 3 || title.length > 120 || details.length > 500 || targetDate === undefined) {
    redirect(`/learning-plans/${plan.id}?error=invalid_step`);
  }
  try {
    await consumeRateLimit(member.id, "learning-plan-step", 30, 60 * 60 * 1000);
  } catch (error) {
    if (error instanceof InteractionError) redirect(`/learning-plans/${plan.id}?error=rate_limit`);
    throw error;
  }
  const prisma = getPrismaClient();
  const count = await prisma.learningPlanStep.count({ where: { planId: plan.id } });
  if (count >= 30) redirect(`/learning-plans/${plan.id}?error=step_limit`);
  await prisma.learningPlanStep.create({
    data: { planId: plan.id, title, details: details || null, targetDate },
  });
  revalidatePath(`/learning-plans/${plan.id}`);
  revalidatePath("/learning-plans");
  redirect(`/learning-plans/${plan.id}?step=added`);
}

export async function setLearningPlanStepCompletion(planId: string, data: FormData) {
  const member = await requireMember();
  const plan = await ownedPlan(planId, member.id);
  const stepId = field(data, "stepId");
  const isComplete = field(data, "completed") === "true";
  const reflection = field(data, "reflection");
  if (!plan || !stepId || stepId.length > 40 || reflection.length > 500)
    throw new InteractionError("This milestone is unavailable or invalid.");
  const prisma = getPrismaClient();
  const step = await prisma.learningPlanStep.findFirst({
    where: { id: stepId, planId: plan.id },
    select: { id: true },
  });
  if (!step) throw new InteractionError("This milestone is unavailable.");
  await prisma.learningPlanStep.update({
    where: { id: step.id },
    data: {
      completedAt: isComplete ? new Date() : null,
      ...(isComplete ? { reflection: reflection || null } : {}),
    },
  });
  if (plan.status === "COMPLETED" && !isComplete) {
    await prisma.learningPlan.update({
      where: { id: plan.id },
      data: { status: "ACTIVE", completedAt: null },
    });
  }
  revalidatePath(`/learning-plans/${plan.id}`);
  revalidatePath("/learning-plans");
}

export async function setLearningPlanStatus(data: FormData) {
  const member = await requireMember();
  const planId = field(data, "planId");
  const status = field(data, "status") as LearningPlanStatus;
  const plan = await ownedPlan(planId, member.id);
  if (!plan || !statuses.includes(status))
    throw new InteractionError("This learning plan is unavailable.");
  const prisma = getPrismaClient();
  if (status === "COMPLETED") {
    const [total, completed] = await Promise.all([
      prisma.learningPlanStep.count({ where: { planId: plan.id } }),
      prisma.learningPlanStep.count({ where: { planId: plan.id, completedAt: { not: null } } }),
    ]);
    if (!total || total !== completed)
      throw new InteractionError("Complete every milestone before finishing this plan.");
  }
  await prisma.learningPlan.update({
    where: { id: plan.id },
    data: { status, completedAt: status === "COMPLETED" ? new Date() : null },
  });
  revalidatePath(`/learning-plans/${plan.id}`);
  revalidatePath("/learning-plans");
  redirect(`/learning-plans/${plan.id}`);
}
