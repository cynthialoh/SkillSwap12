CREATE TYPE "PersonalizationMode" AS ENUM ('ACTIVE', 'PAUSED', 'OFF');

ALTER TABLE "MemberProfile"
  ADD COLUMN "trustLevel" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "MemberProfile_trustLevel_check" CHECK ("trustLevel" >= 1);

CREATE TABLE "DiscoveryPreference" (
  "userId" TEXT NOT NULL,
  "personalizationMode" "PersonalizationMode" NOT NULL DEFAULT 'ACTIVE',
  "useTrustLevel" BOOLEAN NOT NULL DEFAULT true,
  "minimumTrustLevel" INTEGER NOT NULL DEFAULT 1,
  "minimumDirectSwapTrust" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscoveryPreference_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "DiscoveryPreference_minimumTrustLevel_check" CHECK ("minimumTrustLevel" >= 1),
  CONSTRAINT "DiscoveryPreference_minimumDirectSwapTrust_check" CHECK ("minimumDirectSwapTrust" >= 1)
);

CREATE TABLE "SavedSkill" (
  "userId" TEXT NOT NULL,
  "skillListingId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedSkill_pkey" PRIMARY KEY ("userId", "skillListingId")
);

CREATE TABLE "SavedTeacher" (
  "userId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedTeacher_pkey" PRIMARY KEY ("userId", "teacherId"),
  CONSTRAINT "SavedTeacher_not_self_check" CHECK ("userId" <> "teacherId")
);

CREATE TABLE "FollowedSkill" (
  "userId" TEXT NOT NULL,
  "skillListingId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FollowedSkill_pkey" PRIMARY KEY ("userId", "skillListingId")
);

CREATE TABLE "FollowedPerson" (
  "userId" TEXT NOT NULL,
  "personId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FollowedPerson_pkey" PRIMARY KEY ("userId", "personId"),
  CONSTRAINT "FollowedPerson_not_self_check" CHECK ("userId" <> "personId")
);

CREATE TABLE "DismissedRecommendation" (
  "userId" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "reason" VARCHAR(250),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DismissedRecommendation_pkey" PRIMARY KEY ("userId", "targetId"),
  CONSTRAINT "DismissedRecommendation_not_self_check" CHECK ("userId" <> "targetId")
);

CREATE INDEX "DiscoveryPreference_personalizationMode_idx" ON "DiscoveryPreference"("personalizationMode");
CREATE INDEX "SavedSkill_skillListingId_idx" ON "SavedSkill"("skillListingId");
CREATE INDEX "SavedTeacher_teacherId_idx" ON "SavedTeacher"("teacherId");
CREATE INDEX "FollowedSkill_skillListingId_idx" ON "FollowedSkill"("skillListingId");
CREATE INDEX "FollowedPerson_personId_idx" ON "FollowedPerson"("personId");
CREATE INDEX "DismissedRecommendation_targetId_idx" ON "DismissedRecommendation"("targetId");

ALTER TABLE "DiscoveryPreference" ADD CONSTRAINT "DiscoveryPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedSkill" ADD CONSTRAINT "SavedSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedSkill" ADD CONSTRAINT "SavedSkill_skillListingId_fkey" FOREIGN KEY ("skillListingId") REFERENCES "SkillListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedTeacher" ADD CONSTRAINT "SavedTeacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedTeacher" ADD CONSTRAINT "SavedTeacher_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowedSkill" ADD CONSTRAINT "FollowedSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowedSkill" ADD CONSTRAINT "FollowedSkill_skillListingId_fkey" FOREIGN KEY ("skillListingId") REFERENCES "SkillListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowedPerson" ADD CONSTRAINT "FollowedPerson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowedPerson" ADD CONSTRAINT "FollowedPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DismissedRecommendation" ADD CONSTRAINT "DismissedRecommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DismissedRecommendation" ADD CONSTRAINT "DismissedRecommendation_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
