"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { requireAdmin } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { writeAdminAuditEvent } from "@/lib/admin-audit";

export type CreditCodeFormState = {
  status: "idle" | "error" | "success";
  message: string;
  code?: string;
};

const field = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

export async function createAdminCreditCode(
  _previousState: CreditCodeFormState,
  data: FormData,
): Promise<CreditCodeFormState> {
  const actor = await requireAdmin();
  const amount = Number(data.get("amount"));
  const maxRedemptions = Number(data.get("maxRedemptions"));
  const reason = field(data, "reason").slice(0, 500);
  const expiresAtText = field(data, "expiresAt");
  const expiresAt = expiresAtText ? new Date(expiresAtText) : null;
  if (
    !Number.isSafeInteger(amount) ||
    amount < 1 ||
    amount > 100_000 ||
    !Number.isSafeInteger(maxRedemptions) ||
    maxRedemptions < 1 ||
    maxRedemptions > 100_000 ||
    reason.length < 20 ||
    (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()))
  ) {
    return {
      status: "error",
      message: "Enter a valid amount, redemption limit, future expiry (or leave it blank), and a reason of at least 20 characters.",
    };
  }

  const code = `SKILL-${randomBytes(12).toString("hex").toUpperCase()}`;
  const codeHash = hashCode(code);
  const codePrefix = `${code.slice(0, 10)}…`;
  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    await tx.creditCode.create({
      data: {
        codeHash,
        codePrefix,
        amount,
        maxRedemptions,
        reason,
        expiresAt,
        createdById: actor.id,
      },
    });
    await writeAdminAuditEvent(tx, {
      eventKey: "ADMIN_CREDIT_CODE_CREATED",
      actorId: actor.id,
      reason,
      details: {
        codePrefix,
        amount,
        maxRedemptions,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
    });
  });
  revalidatePath("/admin/credit-codes");
  return {
    status: "success",
    message: "Credit code created. Copy it now; the full code is only shown once.",
    code,
  };
}

export async function deactivateAdminCreditCode(data: FormData) {
  const actor = await requireAdmin();
  const codeId = field(data, "codeId");
  const reason = field(data, "reason").slice(0, 500);
  if (!codeId || reason.length < 20) return;

  const prisma = getPrismaClient();
  await prisma.$transaction(async (tx) => {
    const creditCode = await tx.creditCode.findUnique({
      where: { id: codeId },
      select: { id: true, codePrefix: true, isActive: true, redemptionCount: true },
    });
    if (!creditCode || !creditCode.isActive) return;
    await tx.creditCode.update({ where: { id: creditCode.id }, data: { isActive: false } });
    await writeAdminAuditEvent(tx, {
      eventKey: "ADMIN_CREDIT_CODE_DEACTIVATED",
      actorId: actor.id,
      reason,
      details: {
        codePrefix: creditCode.codePrefix,
        redemptionCount: creditCode.redemptionCount,
      } satisfies Prisma.InputJsonObject,
    });
  });
  revalidatePath("/admin/credit-codes");
}
