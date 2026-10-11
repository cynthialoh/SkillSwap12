-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW_REPORTED', 'NO_SHOW', 'DISPUTED');

-- CreateEnum
CREATE TYPE "SessionProposalKind" AS ENUM ('INITIAL', 'RESCHEDULE');

-- CreateEnum
CREATE TYPE "SessionProposalStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'SUPERSEDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SessionIncidentType" AS ENUM ('EMERGENCY', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "SessionIncidentStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "exchangeRequestId" TEXT NOT NULL,
    "legNumber" INTEGER NOT NULL DEFAULT 1,
    "learnerId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'PROPOSED',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "bufferEndsAt" TIMESTAMP(3),
    "meetingProvider" VARCHAR(30),
    "meetingLinkEncrypted" TEXT,
    "learnerReminderOn" BOOLEAN NOT NULL DEFAULT true,
    "learnerReminderMins" INTEGER NOT NULL DEFAULT 1440,
    "teacherReminderOn" BOOLEAN NOT NULL DEFAULT true,
    "teacherReminderMins" INTEGER NOT NULL DEFAULT 1440,
    "cancellationReason" VARCHAR(500),
    "completedAt" TIMESTAMP(3),
    "learnerCompletedAt" TIMESTAMP(3),
    "teacherCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionTimeProposal" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "proposerId" TEXT NOT NULL,
    "kind" "SessionProposalKind" NOT NULL,
    "status" "SessionProposalStatus" NOT NULL DEFAULT 'PENDING',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "timezone" VARCHAR(80) NOT NULL,
    "reason" VARCHAR(500),
    "responseDueAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionTimeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventKey" VARCHAR(60) NOT NULL,
    "fromState" VARCHAR(40),
    "toState" VARCHAR(40),
    "summary" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionIncident" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "type" "SessionIncidentType" NOT NULL,
    "details" VARCHAR(2000) NOT NULL,
    "status" "SessionIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "sessionStatusBeforeReport" VARCHAR(40) NOT NULL,
    "adminNote" VARCHAR(1000),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionReminder" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionReminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_exchangeRequestId_legNumber_key" ON "Session"("exchangeRequestId", "legNumber");

-- CreateIndex
CREATE INDEX "Session_exchangeRequestId_idx" ON "Session"("exchangeRequestId");

-- CreateIndex
CREATE INDEX "Session_learnerId_status_startsAt_idx" ON "Session"("learnerId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "Session_teacherId_status_startsAt_idx" ON "Session"("teacherId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "Session_status_startsAt_idx" ON "Session"("status", "startsAt");

-- CreateIndex
CREATE INDEX "SessionTimeProposal_sessionId_status_createdAt_idx" ON "SessionTimeProposal"("sessionId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SessionTimeProposal_responseDueAt_status_idx" ON "SessionTimeProposal"("responseDueAt", "status");

-- CreateIndex
CREATE INDEX "SessionEvent_sessionId_createdAt_idx" ON "SessionEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "SessionIncident_status_createdAt_idx" ON "SessionIncident"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SessionIncident_sessionId_createdAt_idx" ON "SessionIncident"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "SessionReminder_scheduledFor_sentAt_idx" ON "SessionReminder"("scheduledFor", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "SessionReminder_sessionId_userId_scheduledFor_key" ON "SessionReminder"("sessionId", "userId", "scheduledFor");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_exchangeRequestId_fkey" FOREIGN KEY ("exchangeRequestId") REFERENCES "ExchangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTimeProposal" ADD CONSTRAINT "SessionTimeProposal_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionTimeProposal" ADD CONSTRAINT "SessionTimeProposal_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEvent" ADD CONSTRAINT "SessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionEvent" ADD CONSTRAINT "SessionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionIncident" ADD CONSTRAINT "SessionIncident_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionIncident" ADD CONSTRAINT "SessionIncident_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionIncident" ADD CONSTRAINT "SessionIncident_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionReminder" ADD CONSTRAINT "SessionReminder_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionReminder" ADD CONSTRAINT "SessionReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
