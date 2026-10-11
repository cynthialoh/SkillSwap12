CREATE TYPE "VerificationKind" AS ENUM ('IDENTITY', 'SKILL');
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'DECLINED');
CREATE TYPE "SessionDisputeStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'APPEALED', 'CLOSED');
CREATE TYPE "DisputeOutcome" AS ENUM ('RETURN_TO_LEARNER', 'PAY_TEACHER');
CREATE TYPE "AppealStatus" AS ENUM ('PENDING', 'UPHELD', 'OVERTURNED', 'DISMISSED');

ALTER TABLE "MemberProfile" ADD COLUMN "verifiedAt" TIMESTAMP(3);
ALTER TABLE "MemberProfile" ADD COLUMN "teacherStrikeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MemberProfile" ADD COLUMN "teachingSuspendedUntil" TIMESTAMP(3);
ALTER TABLE "MemberProfile" ADD COLUMN "bookingStrikeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MemberProfile" ADD COLUMN "bookingRestrictedUntil" TIMESTAMP(3);

CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "revieweeId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "publicFeedback" VARCHAR(700),
    "privateFeedback" VARCHAR(1200),
    "isPublicVisible" BOOLEAN NOT NULL DEFAULT TRUE,
    "moderationNote" VARCHAR(700),
    "moderatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Review_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
    CONSTRAINT "Review_participants_distinct_check" CHECK ("reviewerId" <> "revieweeId")
);

CREATE TABLE "TrustLevelEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "fromLevel" INTEGER NOT NULL,
    "toLevel" INTEGER NOT NULL,
    "reasonCode" VARCHAR(60) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrustLevelEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TrustLevelEvent_levels_check" CHECK ("fromLevel" BETWEEN 1 AND 4 AND "toLevel" BETWEEN 1 AND 4 AND "fromLevel" <> "toLevel")
);

CREATE TABLE "VerificationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillListingId" TEXT,
    "kind" "VerificationKind" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "statement" VARCHAR(700) NOT NULL,
    "evidenceObjectKey" VARCHAR(500),
    "evidenceContentType" VARCHAR(100),
    "evidenceSize" INTEGER,
    "evidenceDeleteAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewNote" VARCHAR(1000),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "VerificationRequest_evidence_metadata_check" CHECK (("evidenceObjectKey" IS NULL AND "evidenceContentType" IS NULL AND "evidenceSize" IS NULL) OR ("evidenceObjectKey" IS NOT NULL AND "evidenceContentType" IS NOT NULL AND "evidenceSize" BETWEEN 1 AND 8388608)),
    CONSTRAINT "VerificationRequest_kind_listing_check" CHECK (("kind" = 'SKILL' AND "skillListingId" IS NOT NULL) OR ("kind" = 'IDENTITY' AND "skillListingId" IS NULL))
);

CREATE TABLE "SessionDispute" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "otherUserId" TEXT NOT NULL,
    "status" "SessionDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "details" VARCHAR(2000) NOT NULL,
    "decisionReason" VARCHAR(1200),
    "memberSummary" VARCHAR(600),
    "outcome" "DisputeOutcome",
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SessionDispute_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SessionDispute_participants_distinct_check" CHECK ("openedById" <> "otherUserId")
);

CREATE TABLE "DisputeAppeal" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "filedById" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "details" VARCHAR(1500) NOT NULL,
    "reviewedById" TEXT,
    "decisionReason" VARCHAR(1000),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DisputeAppeal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrustPolicy" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "level2CompletedExchanges" INTEGER NOT NULL DEFAULT 3,
    "level3CompletedExchanges" INTEGER NOT NULL DEFAULT 10,
    "level4CompletedExchanges" INTEGER NOT NULL DEFAULT 25,
    "directSwapStrikeThreshold" INTEGER NOT NULL DEFAULT 3,
    "directSwapSuspensionDays" INTEGER NOT NULL DEFAULT 30,
    "teacherStrikeThreshold" INTEGER NOT NULL DEFAULT 3,
    "teacherSuspensionDays" INTEGER NOT NULL DEFAULT 30,
    "bookingRestrictionThreshold" INTEGER NOT NULL DEFAULT 5,
    "bookingRestrictionDays" INTEGER NOT NULL DEFAULT 7,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrustPolicy_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TrustPolicy_thresholds_check" CHECK (
      "level2CompletedExchanges" >= 1 AND
      "level3CompletedExchanges" > "level2CompletedExchanges" AND
      "level4CompletedExchanges" > "level3CompletedExchanges" AND
      "directSwapStrikeThreshold" >= 1 AND
      "directSwapSuspensionDays" BETWEEN 1 AND 365 AND
      "teacherStrikeThreshold" >= 1 AND
      "teacherSuspensionDays" BETWEEN 1 AND 365 AND
      "bookingRestrictionThreshold" >= 1 AND
      "bookingRestrictionDays" BETWEEN 1 AND 365
    )
);

CREATE UNIQUE INDEX "Review_sessionId_reviewerId_key" ON "Review"("sessionId", "reviewerId");
CREATE INDEX "Review_revieweeId_createdAt_idx" ON "Review"("revieweeId", "createdAt");
CREATE INDEX "TrustLevelEvent_userId_createdAt_idx" ON "TrustLevelEvent"("userId", "createdAt");
CREATE INDEX "VerificationRequest_status_submittedAt_idx" ON "VerificationRequest"("status", "submittedAt");
CREATE INDEX "VerificationRequest_userId_status_submittedAt_idx" ON "VerificationRequest"("userId", "status", "submittedAt");
CREATE INDEX "VerificationRequest_evidenceDeleteAt_idx" ON "VerificationRequest"("evidenceDeleteAt");
CREATE INDEX "SessionDispute_status_createdAt_idx" ON "SessionDispute"("status", "createdAt");
CREATE INDEX "SessionDispute_openedById_createdAt_idx" ON "SessionDispute"("openedById", "createdAt");
CREATE INDEX "SessionDispute_otherUserId_createdAt_idx" ON "SessionDispute"("otherUserId", "createdAt");
CREATE UNIQUE INDEX "SessionDispute_sessionId_key" ON "SessionDispute"("sessionId");
CREATE UNIQUE INDEX "DisputeAppeal_disputeId_key" ON "DisputeAppeal"("disputeId");
CREATE INDEX "DisputeAppeal_status_createdAt_idx" ON "DisputeAppeal"("status", "createdAt");
CREATE INDEX "TrustPolicy_updatedAt_idx" ON "TrustPolicy"("updatedAt");

ALTER TABLE "Review" ADD CONSTRAINT "Review_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_revieweeId_fkey" FOREIGN KEY ("revieweeId") REFERENCES "MemberProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrustLevelEvent" ADD CONSTRAINT "TrustLevelEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "MemberProfile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrustLevelEvent" ADD CONSTRAINT "TrustLevelEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_skillListingId_fkey" FOREIGN KEY ("skillListingId") REFERENCES "SkillListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VerificationRequest" ADD CONSTRAINT "VerificationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SessionDispute" ADD CONSTRAINT "SessionDispute_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionDispute" ADD CONSTRAINT "SessionDispute_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionDispute" ADD CONSTRAINT "SessionDispute_otherUserId_fkey" FOREIGN KEY ("otherUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionDispute" ADD CONSTRAINT "SessionDispute_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DisputeAppeal" ADD CONSTRAINT "DisputeAppeal_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "SessionDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisputeAppeal" ADD CONSTRAINT "DisputeAppeal_filedById_fkey" FOREIGN KEY ("filedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DisputeAppeal" ADD CONSTRAINT "DisputeAppeal_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
