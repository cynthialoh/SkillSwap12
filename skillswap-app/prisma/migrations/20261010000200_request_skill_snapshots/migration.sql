/*
  Warnings:

  - Added the required column `targetSkillName` to the `ExchangeRequest` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "ExchangeRequest" DROP CONSTRAINT "ExchangeRequest_offerSkillId_fkey";

-- DropForeignKey
ALTER TABLE "ExchangeRequest" DROP CONSTRAINT "ExchangeRequest_targetSkillId_fkey";

-- DropForeignKey
ALTER TABLE "LearningRequest" DROP CONSTRAINT "LearningRequest_skillListingId_fkey";

-- AlterTable
ALTER TABLE "ExchangeRequest" ADD COLUMN     "offerSkillName" VARCHAR(100),
ADD COLUMN     "targetSkillName" VARCHAR(100) NOT NULL,
ALTER COLUMN "targetSkillId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "LearningRequest" ALTER COLUMN "skillListingId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "LearningRequest" ADD CONSTRAINT "LearningRequest_skillListingId_fkey" FOREIGN KEY ("skillListingId") REFERENCES "SkillListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRequest" ADD CONSTRAINT "ExchangeRequest_targetSkillId_fkey" FOREIGN KEY ("targetSkillId") REFERENCES "SkillListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRequest" ADD CONSTRAINT "ExchangeRequest_offerSkillId_fkey" FOREIGN KEY ("offerSkillId") REFERENCES "SkillListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
