CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'RESTRICTED', 'SUSPENDED', 'DELETION_PENDING');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Identity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberProfile" (
    "userId" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberProfile_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "AdminGrant" (
    "userId" TEXT NOT NULL,
    "grantedById" TEXT,
    "reason" VARCHAR(500) NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminGrant_pkey" PRIMARY KEY ("userId")
);

CREATE UNIQUE INDEX "Identity_provider_subject_key" ON "Identity"("provider", "subject");
CREATE INDEX "Identity_userId_idx" ON "Identity"("userId");
CREATE INDEX "AdminGrant_grantedById_idx" ON "AdminGrant"("grantedById");

ALTER TABLE "Identity" ADD CONSTRAINT "Identity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberProfile" ADD CONSTRAINT "MemberProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminGrant" ADD CONSTRAINT "AdminGrant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminGrant" ADD CONSTRAINT "AdminGrant_grantedById_fkey"
  FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
