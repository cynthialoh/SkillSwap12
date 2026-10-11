"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  creditPostingEnabled,
  ensureCreditAccount,
  lockCreditWallet,
  postBalancedCreditTransaction,
} from "@/lib/credit-ledger";

const unavailablePath = "/wallet?promo=unavailable";

export async function redeemCreditCode(data: FormData) {
  const member = await requireMember();
  if (!creditPostingEnabled()) redirect("/wallet?promo=paused");
  const code = String(data.get("code") ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (!/^SKILL-[A-F0-9]{24}$/.test(code)) redirect(unavailablePath);

  const codeHash = createHash("sha256").update(code).digest("hex");
  const prisma = getPrismaClient();
  const redeemed = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "CreditCode" WHERE "codeHash" = ${codeHash} FOR UPDATE
      `;
      const creditCode = await tx.creditCode.findUnique({ where: { codeHash } });
      if (
        !creditCode ||
        !creditCode.isActive ||
        (creditCode.expiresAt && creditCode.expiresAt <= new Date()) ||
        creditCode.redemptionCount >= creditCode.maxRedemptions
      )
        return false;

      await lockCreditWallet(tx, member.id);
      const priorRedemption = await tx.creditCodeRedemption.findUnique({
        where: { creditCodeId_userId: { creditCodeId: creditCode.id, userId: member.id } },
        select: { id: true },
      });
      if (priorRedemption) return false;

      const memberAccount = await ensureCreditAccount(tx, "MEMBER_SPENDABLE", member.id);
      const promotionReserve = await ensureCreditAccount(tx, "PROMOTION_RESERVE");
      const ledger = await postBalancedCreditTransaction(tx, {
        idempotencyKey: `credit-code:${creditCode.id}:${member.id}`,
        type: "PROMOTION",
        actorId: member.id,
        reason: `Redeemed Skill Credit code ${creditCode.codePrefix}`,
        metadata: {
          creditCodeId: creditCode.id,
          codePrefix: creditCode.codePrefix,
          amount: creditCode.amount,
        },
        postings: [
          { accountId: promotionReserve.id, amount: -creditCode.amount, source: "PROMOTIONAL" },
          { accountId: memberAccount.id, amount: creditCode.amount, source: "PROMOTIONAL" },
        ],
      });
      await tx.creditCodeRedemption.create({
        data: {
          creditCodeId: creditCode.id,
          userId: member.id,
          ledgerTransactionId: ledger.id,
        },
      });
      await tx.creditCode.update({
        where: { id: creditCode.id },
        data: { redemptionCount: { increment: 1 } },
      });
      return true;
    },
  );

  if (!redeemed) redirect(unavailablePath);
  revalidatePath("/wallet");
  redirect("/wallet?promo=redeemed");
}
