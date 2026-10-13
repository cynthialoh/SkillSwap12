"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  creditGiftingEnabled,
  ensureCreditAccount,
  getMemberCreditTotals,
  lockCreditWallet,
  postBalancedCreditTransaction,
} from "@/lib/credit-ledger";
import { enqueueNotification } from "@/lib/notifications";

const SINGLE_GIFT_LIMIT = 100;
const DAILY_GIFT_LIMIT = 250;
const DAILY_GIFT_COUNT_LIMIT = 5;

export async function sendCreditGift(data: FormData) {
  const sender = await requireMember();
  const recipientId = String(data.get("recipientId") ?? "").trim();
  const amount = Number(data.get("amount"));
  const message = String(data.get("message") ?? "")
    .trim()
    .slice(0, 240);
  const token = String(data.get("idempotencyToken") ?? "").trim();
  if (
    !recipientId ||
    recipientId === sender.id ||
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > SINGLE_GIFT_LIMIT ||
    !/^[0-9a-f-]{36}$/i.test(token)
  )
    return;
  if (!creditGiftingEnabled())
    throw new Error(
      "Credit gifts are disabled until gifting is enabled with the approved Phase 1 policy.",
    );
  const prisma = getPrismaClient();
  const giftIdempotencyKey = `credit-gift:${sender.id}:${token}`;
  const result = await prisma.$transaction(
    async (tx) => {
      for (const userId of [sender.id, recipientId].sort()) await lockCreditWallet(tx, userId);
      const prior = await tx.creditGift.findUnique({
        where: { idempotencyKey: giftIdempotencyKey },
        select: { id: true, recipientId: true, amount: true },
      });
      if (prior)
        return {
          gift: prior,
          senderName: sender.profile?.displayName || "A SkillSwap Member",
          replay: true,
        };
      const recipient = await tx.user.findUnique({
        where: { id: recipientId },
        select: {
          id: true,
          status: true,
          authUser: { select: { email: true, emailVerified: true } },
          adminGrant: { select: { userId: true } },
          memberProfile: {
            select: { displayName: true, isDiscoverable: true, onboardingCompletedAt: true },
          },
        },
      });
      if (
        !recipient ||
        recipient.status !== "ACTIVE" ||
        recipient.adminGrant ||
        !recipient.authUser?.emailVerified ||
        !recipient.memberProfile?.isDiscoverable ||
        !recipient.memberProfile.onboardingCompletedAt
      )
        throw new Error("This Member cannot receive a gift right now.");
      const blocked = await tx.profileBlock.findFirst({
        where: {
          OR: [
            { blockerId: sender.id, blockedUserId: recipient.id },
            { blockerId: recipient.id, blockedUserId: sender.id },
          ],
        },
        select: { id: true },
      });
      if (blocked) throw new Error("Credit gifts are unavailable for this Member relationship.");
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [giftCount, gifted] = await Promise.all([
        tx.creditGift.count({ where: { senderId: sender.id, createdAt: { gte: since } } }),
        tx.creditGift.aggregate({
          where: { senderId: sender.id, createdAt: { gte: since } },
          _sum: { amount: true },
        }),
      ]);
      if (
        giftCount >= DAILY_GIFT_COUNT_LIMIT ||
        (gifted._sum.amount ?? 0) + amount > DAILY_GIFT_LIMIT
      )
        throw new Error("Your rolling 24-hour gift limit has been reached.");
      const totals = await getMemberCreditTotals(tx, sender.id);
      if (totals.spendable < amount)
        throw new Error("Your spendable credit balance is too low for this gift.");
      const debit = await ensureCreditAccount(tx, "MEMBER_SPENDABLE", sender.id);
      const credit = await ensureCreditAccount(tx, "MEMBER_SPENDABLE", recipient.id);
      const ledger = await postBalancedCreditTransaction(tx, {
        idempotencyKey: giftIdempotencyKey,
        type: "GIFT",
        actorId: sender.id,
        reason: "Member-to-member Skill Credit gift.",
        metadata: { recipientId: recipient.id, amount },
        postings: [
          { accountId: debit.id, amount: -amount, source: "GIFT" },
          { accountId: credit.id, amount, source: "GIFT" },
        ],
      });
      const gift = await tx.creditGift.create({
        data: {
          senderId: sender.id,
          recipientId: recipient.id,
          amount,
          message: message || null,
          idempotencyKey: giftIdempotencyKey,
          ledgerTransactionId: ledger.id,
        },
        select: { id: true, recipientId: true, amount: true },
      });
      return {
        gift,
        senderName: sender.profile?.displayName || "A SkillSwap Member",
        replay: false,
      };
    },
    { isolationLevel: "Serializable" },
  );

  if (!result.replay) {
    await enqueueNotification({
      recipientId: result.gift.recipientId,
      actorId: sender.id,
      category: "ACCOUNT",
      eventKey: "CREDIT_GIFT_RECEIVED",
      idempotencyKey: `credit-gift-notification:${result.gift.id}`,
      title: "You received Skill Credits",
      body: `${result.senderName} sent you ${result.gift.amount} Skill Credits.`,
      href: "/wallet",
    });
  }
  revalidatePath("/wallet");
  revalidatePath("/wallet/gift");
  revalidatePath(`/profiles/${recipientId}`);
  redirect("/wallet/gift?sent=1");
}
