ALTER TABLE "MemberProfile"
ADD COLUMN "profileImageObjectKey" VARCHAR(300);

CREATE TABLE "MemberMedia" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "communityPostId" TEXT,
    "objectKey" VARCHAR(300) NOT NULL,
    "contentType" VARCHAR(80) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberMedia_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberMedia_objectKey_key" ON "MemberMedia"("objectKey");
CREATE INDEX "MemberMedia_userId_communityPostId_createdAt_idx" ON "MemberMedia"("userId", "communityPostId", "createdAt");

ALTER TABLE "MemberMedia"
ADD CONSTRAINT "MemberMedia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemberMedia"
ADD CONSTRAINT "MemberMedia_communityPostId_fkey" FOREIGN KEY ("communityPostId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
