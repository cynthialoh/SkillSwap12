CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'PRIVATE');
CREATE TYPE "SkillDirection" AS ENUM ('TEACH', 'LEARN');
CREATE TYPE "ExperienceLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');
CREATE TYPE "SkillVerificationStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'APPROVED', 'DECLINED');
CREATE TYPE "ProfileAccessStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'IGNORED', 'REVOKED', 'BLOCKED');

ALTER TABLE "MemberProfile"
  ADD COLUMN "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "acceptLearningRequests" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "acceptDirectSwapRequests" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "acceptMessages" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "hiddenUntil" TIMESTAMP(3),
  ADD COLUMN "privacyReviewRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "hideRestoreReminder" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "SkillCategory" (
  "id" TEXT NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SkillCategory_pkey" PRIMARY KEY ("id")
);

INSERT INTO "SkillCategory" ("id", "name", "slug") VALUES
  ('cat-arts', 'Arts & Design', 'arts-design'),
  ('cat-business', 'Business & Career', 'business-career'),
  ('cat-cooking', 'Cooking & Food', 'cooking-food'),
  ('cat-languages', 'Languages', 'languages'),
  ('cat-music', 'Music', 'music'),
  ('cat-technology', 'Technology', 'technology'),
  ('cat-wellness', 'Wellness & Lifestyle', 'wellness-lifestyle'),
  ('cat-other', 'Other', 'other');

CREATE TABLE "SkillListing" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "direction" "SkillDirection" NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "topics" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "outcomes" VARCHAR(500),
  "experienceLevel" "ExperienceLevel" NOT NULL DEFAULT 'BEGINNER',
  "yearsExperience" INTEGER NOT NULL DEFAULT 0,
  "priceCredits" INTEGER,
  "verificationStatus" "SkillVerificationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "verificationRequestedAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SkillListing_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SkillListing_priceCredits_check" CHECK ("priceCredits" IS NULL OR "priceCredits" BETWEEN 0 AND 1000),
  CONSTRAINT "SkillListing_yearsExperience_check" CHECK ("yearsExperience" BETWEEN 0 AND 80)
);

INSERT INTO "SkillListing" ("id", "userId", "categoryId", "direction", "name", "createdAt", "updatedAt")
SELECT md5(profile."userId" || ':teach:' || skills.skill), profile."userId", 'cat-other', 'TEACH', skills.skill, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "MemberProfile" AS profile
CROSS JOIN LATERAL unnest(profile."teachSkills") AS skills(skill)
WHERE length(trim(skills.skill)) BETWEEN 1 AND 100
ON CONFLICT DO NOTHING;

INSERT INTO "SkillListing" ("id", "userId", "categoryId", "direction", "name", "createdAt", "updatedAt")
SELECT md5(profile."userId" || ':learn:' || skills.skill), profile."userId", 'cat-other', 'LEARN', skills.skill, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "MemberProfile" AS profile
CROSS JOIN LATERAL unnest(profile."learnSkills") AS skills(skill)
WHERE length(trim(skills.skill)) BETWEEN 1 AND 100
ON CONFLICT DO NOTHING;

CREATE TABLE "ProfileAccessRequest" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "status" "ProfileAccessStatus" NOT NULL DEFAULT 'PENDING',
  "reason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "decidedAt" TIMESTAMP(3),
  CONSTRAINT "ProfileAccessRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfileAccessRequest_not_self_check" CHECK ("requesterId" <> "ownerId")
);

CREATE TABLE "ProfileBlock" (
  "id" TEXT NOT NULL,
  "blockerId" TEXT NOT NULL,
  "blockedUserId" TEXT NOT NULL,
  "reason" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileBlock_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProfileBlock_not_self_check" CHECK ("blockerId" <> "blockedUserId")
);

CREATE UNIQUE INDEX "SkillCategory_name_key" ON "SkillCategory"("name");
CREATE UNIQUE INDEX "SkillCategory_slug_key" ON "SkillCategory"("slug");
CREATE UNIQUE INDEX "SkillListing_userId_direction_name_key" ON "SkillListing"("userId", "direction", "name");
CREATE INDEX "SkillListing_userId_direction_isActive_idx" ON "SkillListing"("userId", "direction", "isActive");
CREATE INDEX "SkillListing_categoryId_direction_isActive_idx" ON "SkillListing"("categoryId", "direction", "isActive");
CREATE UNIQUE INDEX "ProfileAccessRequest_requesterId_ownerId_key" ON "ProfileAccessRequest"("requesterId", "ownerId");
CREATE INDEX "ProfileAccessRequest_ownerId_status_createdAt_idx" ON "ProfileAccessRequest"("ownerId", "status", "createdAt");
CREATE INDEX "ProfileAccessRequest_requesterId_status_idx" ON "ProfileAccessRequest"("requesterId", "status");
CREATE UNIQUE INDEX "ProfileBlock_blockerId_blockedUserId_key" ON "ProfileBlock"("blockerId", "blockedUserId");
CREATE INDEX "ProfileBlock_blockedUserId_idx" ON "ProfileBlock"("blockedUserId");

ALTER TABLE "SkillListing" ADD CONSTRAINT "SkillListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SkillListing" ADD CONSTRAINT "SkillListing_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SkillCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProfileAccessRequest" ADD CONSTRAINT "ProfileAccessRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileAccessRequest" ADD CONSTRAINT "ProfileAccessRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileBlock" ADD CONSTRAINT "ProfileBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileBlock" ADD CONSTRAINT "ProfileBlock_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
