import "server-only";
import { randomBytes } from "node:crypto";
import { getPrismaClient } from "@/lib/db/prisma";

export async function ensureMemberReferralCode(userId: string) {
  const prisma = getPrismaClient();
  const existing = await prisma.referralCode.findUnique({
    where: { userId },
    select: { code: true },
  });
  if (existing) return existing.code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const created = await prisma.referralCode.create({
        data: { userId, code: randomBytes(6).toString("hex").toUpperCase() },
        select: { code: true },
      });
      return created.code;
    } catch (error) {
      const code = await prisma.referralCode.findUnique({
        where: { userId },
        select: { code: true },
      });
      if (code) return code.code;
      if (attempt === 4) throw error;
    }
  }

  throw new Error("Could not create a referral link.");
}
