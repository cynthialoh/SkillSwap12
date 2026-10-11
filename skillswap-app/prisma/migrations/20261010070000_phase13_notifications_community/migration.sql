CREATE TYPE "CommunityPostType" AS ENUM ('TIP', 'PROJECT', 'PROGRESS', 'TUTORIAL');
CREATE TYPE "CommunityPostStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'REMOVED');
CREATE TYPE "CommunityVisibility" AS ENUM ('PUBLIC', 'FOLLOWERS');
CREATE TYPE "CommunityReportStatus" AS ENUM ('OPEN', 'REVIEWED', 'DISMISSED');
CREATE TYPE "NotificationCategory" AS ENUM ('MESSAGE', 'SESSION', 'COMMUNITY', 'RECOMMENDATION', 'ACCOUNT');
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

CREATE TABLE "NotificationPreference" (
  "userId" TEXT NOT NULL,
  "inAppMessages" BOOLEAN NOT NULL DEFAULT TRUE,
  "inAppSessions" BOOLEAN NOT NULL DEFAULT TRUE,
  "inAppCommunity" BOOLEAN NOT NULL DEFAULT TRUE,
  "inAppRecommendations" BOOLEAN NOT NULL DEFAULT TRUE,
  "inAppAccount" BOOLEAN NOT NULL DEFAULT TRUE,
  "emailMessages" BOOLEAN NOT NULL DEFAULT TRUE,
  "emailSessions" BOOLEAN NOT NULL DEFAULT TRUE,
  "emailCommunity" BOOLEAN NOT NULL DEFAULT FALSE,
  "emailRecommendations" BOOLEAN NOT NULL DEFAULT FALSE,
  "emailAccount" BOOLEAN NOT NULL DEFAULT FALSE,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "actorId" TEXT,
  "category" "NotificationCategory" NOT NULL,
  "eventKey" VARCHAR(80) NOT NULL,
  "idempotencyKey" VARCHAR(180) NOT NULL,
  "title" VARCHAR(140) NOT NULL,
  "body" VARCHAR(500) NOT NULL,
  "href" VARCHAR(300) NOT NULL,
  "inApp" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Notification_idempotencyKey_key" ON "Notification"("idempotencyKey");
CREATE INDEX "Notification_recipientId_readAt_createdAt_idx" ON "Notification"("recipientId", "readAt", "createdAt");
CREATE INDEX "Notification_eventKey_createdAt_idx" ON "Notification"("eventKey", "createdAt");

CREATE TABLE "EmailDelivery" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "lastError" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmailDelivery_notificationId_key" ON "EmailDelivery"("notificationId");
CREATE INDEX "EmailDelivery_status_nextAttemptAt_idx" ON "EmailDelivery"("status", "nextAttemptAt");

CREATE TABLE "CommunityPost" (
  "id" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "type" "CommunityPostType" NOT NULL,
  "visibility" "CommunityVisibility" NOT NULL DEFAULT 'PUBLIC',
  "status" "CommunityPostStatus" NOT NULL DEFAULT 'PUBLISHED',
  "title" VARCHAR(120) NOT NULL,
  "body" VARCHAR(2000) NOT NULL,
  "skillTags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunityPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CommunityPost_status_visibility_createdAt_idx" ON "CommunityPost"("status", "visibility", "createdAt");
CREATE INDEX "CommunityPost_authorId_status_createdAt_idx" ON "CommunityPost"("authorId", "status", "createdAt");

CREATE TABLE "CommunityPostReaction" (
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityPostReaction_pkey" PRIMARY KEY ("postId", "userId"),
  CONSTRAINT "CommunityPostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommunityPostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CommunityPostReaction_userId_createdAt_idx" ON "CommunityPostReaction"("userId", "createdAt");

CREATE TABLE "CommunityPostComment" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityPostComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunityPostComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommunityPostComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CommunityPostComment_postId_createdAt_idx" ON "CommunityPostComment"("postId", "createdAt");
CREATE INDEX "CommunityPostComment_userId_createdAt_idx" ON "CommunityPostComment"("userId", "createdAt");

CREATE TABLE "CommunityPostSave" (
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityPostSave_pkey" PRIMARY KEY ("postId", "userId"),
  CONSTRAINT "CommunityPostSave_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommunityPostSave_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CommunityPostSave_userId_createdAt_idx" ON "CommunityPostSave"("userId", "createdAt");

CREATE TABLE "CommunityContentReport" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "reporterId" TEXT NOT NULL,
  "category" VARCHAR(40) NOT NULL,
  "details" VARCHAR(1000) NOT NULL,
  "status" "CommunityReportStatus" NOT NULL DEFAULT 'OPEN',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommunityContentReport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommunityContentReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommunityContentReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommunityContentReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CommunityContentReport_postId_reporterId_key" ON "CommunityContentReport"("postId", "reporterId");
CREATE INDEX "CommunityContentReport_status_createdAt_idx" ON "CommunityContentReport"("status", "createdAt");

CREATE TABLE "MutedMember" (
  "userId" TEXT NOT NULL,
  "mutedUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MutedMember_pkey" PRIMARY KEY ("userId", "mutedUserId"),
  CONSTRAINT "MutedMember_not_self_check" CHECK ("userId" <> "mutedUserId"),
  CONSTRAINT "MutedMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MutedMember_mutedUserId_fkey" FOREIGN KEY ("mutedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MutedMember_mutedUserId_idx" ON "MutedMember"("mutedUserId");
