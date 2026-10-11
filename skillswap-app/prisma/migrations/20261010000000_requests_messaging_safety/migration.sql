-- CreateEnum
CREATE TYPE "LearningRequestStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ResponseVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "RequestResponseStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ExchangeRequestType" AS ENUM ('CREDIT_LEARNING', 'DIRECT_SWAP');

-- CreateEnum
CREATE TYPE "ExchangeRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SafetyReportCategory" AS ENUM ('HARASSMENT', 'SCAM', 'INAPPROPRIATE_CONTENT', 'SAFETY', 'SPAM', 'OTHER');

-- CreateEnum
CREATE TYPE "SafetyReportStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "LearningRequest" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "skillListingId" TEXT NOT NULL,
    "skillName" VARCHAR(100) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "scope" VARCHAR(1000) NOT NULL,
    "expectedOutcome" VARCHAR(500) NOT NULL,
    "status" "LearningRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "LearningRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningRequestResponse" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "responderId" TEXT NOT NULL,
    "visibility" "ResponseVisibility" NOT NULL DEFAULT 'PRIVATE',
    "message" VARCHAR(1000) NOT NULL,
    "offeredSkillId" TEXT,
    "status" "RequestResponseStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "LearningRequestResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "ExchangeRequestType" NOT NULL,
    "status" "ExchangeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "targetSkillId" TEXT NOT NULL,
    "offerSkillId" TEXT,
    "title" VARCHAR(120) NOT NULL,
    "scope" VARCHAR(1000) NOT NULL,
    "expectedOutcome" VARCHAR(500) NOT NULL,
    "message" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "ExchangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestActivity" (
    "id" TEXT NOT NULL,
    "learningRequestId" TEXT,
    "exchangeRequestId" TEXT,
    "actorId" TEXT NOT NULL,
    "eventKey" VARCHAR(60) NOT NULL,
    "fromState" VARCHAR(40),
    "toState" VARCHAR(40),
    "summary" VARCHAR(300),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "memberLowId" TEXT NOT NULL,
    "memberHighId" TEXT NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" VARCHAR(4000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "category" "SafetyReportCategory" NOT NULL,
    "details" VARCHAR(2000) NOT NULL,
    "context" VARCHAR(1000),
    "status" "SafetyReportStatus" NOT NULL DEFAULT 'OPEN',
    "conversationId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionRateLimit" (
    "userId" TEXT NOT NULL,
    "action" VARCHAR(40) NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ActionRateLimit_pkey" PRIMARY KEY ("userId","action","windowStart")
);

-- CreateIndex
CREATE INDEX "LearningRequest_status_createdAt_idx" ON "LearningRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LearningRequest_ownerId_status_updatedAt_idx" ON "LearningRequest"("ownerId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "LearningRequest_skillListingId_status_idx" ON "LearningRequest"("skillListingId", "status");

-- CreateIndex
CREATE INDEX "LearningRequestResponse_responderId_status_createdAt_idx" ON "LearningRequestResponse"("responderId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearningRequestResponse_requestId_responderId_key" ON "LearningRequestResponse"("requestId", "responderId");

-- CreateIndex
CREATE INDEX "ExchangeRequest_requesterId_status_createdAt_idx" ON "ExchangeRequest"("requesterId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ExchangeRequest_recipientId_status_createdAt_idx" ON "ExchangeRequest"("recipientId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ExchangeRequest_status_createdAt_idx" ON "ExchangeRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RequestActivity_learningRequestId_createdAt_idx" ON "RequestActivity"("learningRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestActivity_exchangeRequestId_createdAt_idx" ON "RequestActivity"("exchangeRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "Connection_memberLowId_status_idx" ON "Connection"("memberLowId", "status");

-- CreateIndex
CREATE INDEX "Connection_memberHighId_status_idx" ON "Connection"("memberHighId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Connection_memberLowId_memberHighId_key" ON "Connection"("memberLowId", "memberHighId");

-- CreateIndex
CREATE INDEX "Conversation_connectionId_isActive_lastMessageAt_idx" ON "Conversation"("connectionId", "isActive", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_lastReadAt_idx" ON "ConversationParticipant"("userId", "lastReadAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "SafetyReport_status_createdAt_idx" ON "SafetyReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SafetyReport_reportedUserId_createdAt_idx" ON "SafetyReport"("reportedUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionRateLimit_windowStart_idx" ON "ActionRateLimit"("windowStart");

-- AddForeignKey
ALTER TABLE "LearningRequest" ADD CONSTRAINT "LearningRequest_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRequest" ADD CONSTRAINT "LearningRequest_skillListingId_fkey" FOREIGN KEY ("skillListingId") REFERENCES "SkillListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRequestResponse" ADD CONSTRAINT "LearningRequestResponse_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "LearningRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRequestResponse" ADD CONSTRAINT "LearningRequestResponse_responderId_fkey" FOREIGN KEY ("responderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningRequestResponse" ADD CONSTRAINT "LearningRequestResponse_offeredSkillId_fkey" FOREIGN KEY ("offeredSkillId") REFERENCES "SkillListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRequest" ADD CONSTRAINT "ExchangeRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRequest" ADD CONSTRAINT "ExchangeRequest_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRequest" ADD CONSTRAINT "ExchangeRequest_targetSkillId_fkey" FOREIGN KEY ("targetSkillId") REFERENCES "SkillListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRequest" ADD CONSTRAINT "ExchangeRequest_offerSkillId_fkey" FOREIGN KEY ("offerSkillId") REFERENCES "SkillListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestActivity" ADD CONSTRAINT "RequestActivity_learningRequestId_fkey" FOREIGN KEY ("learningRequestId") REFERENCES "LearningRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestActivity" ADD CONSTRAINT "RequestActivity_exchangeRequestId_fkey" FOREIGN KEY ("exchangeRequestId") REFERENCES "ExchangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_memberLowId_fkey" FOREIGN KEY ("memberLowId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_memberHighId_fkey" FOREIGN KEY ("memberHighId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "Connection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyReport" ADD CONSTRAINT "SafetyReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyReport" ADD CONSTRAINT "SafetyReport_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyReport" ADD CONSTRAINT "SafetyReport_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyReport" ADD CONSTRAINT "SafetyReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionRateLimit" ADD CONSTRAINT "ActionRateLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
