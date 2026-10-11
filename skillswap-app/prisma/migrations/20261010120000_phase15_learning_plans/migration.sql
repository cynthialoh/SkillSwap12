CREATE TYPE "LearningPlanStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

CREATE TABLE "LearningPlan" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "skillName" VARCHAR(100) NOT NULL,
  "goal" VARCHAR(700) NOT NULL,
  "targetDate" TIMESTAMP(3),
  "status" "LearningPlanStatus" NOT NULL DEFAULT 'ACTIVE',
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningPlan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LearningPlan_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LearningPlan_ownerId_status_updatedAt_idx" ON "LearningPlan"("ownerId", "status", "updatedAt");

CREATE TABLE "LearningPlanStep" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "title" VARCHAR(120) NOT NULL,
  "details" VARCHAR(500),
  "reflection" VARCHAR(500),
  "targetDate" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LearningPlanStep_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LearningPlanStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "LearningPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LearningPlanStep_planId_createdAt_idx" ON "LearningPlanStep"("planId", "createdAt");
