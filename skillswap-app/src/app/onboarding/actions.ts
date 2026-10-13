"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AccessDeniedError, requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { ensureProfileCompletionReward, rewardReferralInviter } from "@/lib/credit-ledger";

export type OnboardingState = { error?: string } | undefined;

function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function listField(formData: FormData, name: string) {
  return field(formData, name)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export async function saveOnboarding(
  _state: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  let member;
  try {
    member = await requireMember();
  } catch (error) {
    return {
      error: error instanceof AccessDeniedError ? error.message : "Please sign in and try again.",
    };
  }

  const displayName = field(formData, "displayName");
  const bio = field(formData, "bio");
  const location = field(formData, "location");
  const timezone = field(formData, "timezone");
  const teachSkills = listField(formData, "teachSkills");
  const learnSkills = listField(formData, "learnSkills");
  const availability = field(formData, "availability");
  const rawReferralCode = field(formData, "referralCode").toUpperCase();
  const referralCode = /^[A-F0-9]{12}$/.test(rawReferralCode) ? rawReferralCode : "";
  const isDiscoverable = formData.get("isDiscoverable") === "on";
  let inviterRewarded = false;

  if (displayName.length < 2 || displayName.length > 80)
    return { error: "Enter a name between 2 and 80 characters." };
  if (bio.length > 500) return { error: "Your introduction must be 500 characters or fewer." };
  if (timezone.length < 3 || timezone.length > 80)
    return { error: "Enter a valid time zone, such as Europe/London." };
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return { error: "Enter a valid IANA time zone, such as Europe/London." };
  }

  try {
    const prisma = getPrismaClient();
    await prisma.$transaction(async (tx) => {
      await tx.memberProfile.update({
        where: { userId: member.id },
        data: {
          displayName,
          bio: bio || null,
          location: location || null,
          timezone,
          teachSkills,
          learnSkills,
          availability: availability ? { notes: availability.slice(0, 1000) } : undefined,
          isDiscoverable,
          onboardingCompletedAt: new Date(),
        },
      });
      inviterRewarded = referralCode
        ? await rewardReferralInviter(tx, member.id, referralCode)
        : false;
      await ensureProfileCompletionReward(tx, member.id);
      const otherCategory = await tx.skillCategory.findUnique({
        where: { slug: "other" },
        select: { id: true },
      });
      if (otherCategory) {
        const uniqueNames = (items: string[]) => [
          ...new Map(
            items.map((item) => [
              item.toLocaleLowerCase(),
              item.replace(/\s+/g, " ").slice(0, 100),
            ]),
          ).values(),
        ];
        for (const [direction, names] of [
          ["TEACH", uniqueNames(teachSkills)],
          ["LEARN", uniqueNames(learnSkills)],
        ] as const) {
          for (const name of names) {
            await tx.skillListing.upsert({
              where: { userId_direction_name: { userId: member.id, direction, name } },
              create: { userId: member.id, categoryId: otherCategory.id, direction, name },
              update: {},
            });
          }
        }
      }
    });
  } catch {
    return { error: "We could not save your profile right now. Please try again." };
  }

  revalidatePath("/member");
  revalidatePath("/wallet");
  redirect(`/member?welcome=${inviterRewarded ? "referral" : "credits"}`);
}
