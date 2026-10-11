-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CreditSource" ADD VALUE 'DIRECT_SWAP_DEPOSIT';
ALTER TYPE "CreditSource" ADD VALUE 'DIRECT_SWAP_FORFEITURE';
ALTER TYPE "CreditSource" ADD VALUE 'DIRECT_SWAP_COMPENSATION';

-- AlterEnum
ALTER TYPE "CreditTransactionType" ADD VALUE 'DIRECT_SWAP_SETTLEMENT';

-- AlterTable
ALTER TABLE "MemberProfile" ADD COLUMN     "directSwapStrikeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "directSwapSuspendedUntil" TIMESTAMP(3);

ALTER TABLE "MemberProfile"
  ADD CONSTRAINT "MemberProfile_directSwapStrikeCount_nonnegative_check"
  CHECK ("directSwapStrikeCount" >= 0);
