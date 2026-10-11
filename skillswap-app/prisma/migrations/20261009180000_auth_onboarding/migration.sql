CREATE TABLE "AuthUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthAccount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthVerification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthVerification_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "authUserId" TEXT;
ALTER TABLE "MemberProfile" ADD COLUMN "location" VARCHAR(120);
ALTER TABLE "MemberProfile" ADD COLUMN "timezone" VARCHAR(80) NOT NULL DEFAULT 'UTC';
ALTER TABLE "MemberProfile" ADD COLUMN "teachSkills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MemberProfile" ADD COLUMN "learnSkills" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MemberProfile" ADD COLUMN "availability" JSONB;
ALTER TABLE "MemberProfile" ADD COLUMN "isDiscoverable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "MemberProfile" ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);

CREATE TABLE "SecurityAuditEvent" (
    "id" TEXT NOT NULL,
    "eventKey" VARCHAR(80) NOT NULL,
    "actorId" TEXT,
    "targetUserId" TEXT,
    "reason" VARCHAR(500),
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthUser_email_key" ON "AuthUser"("email");
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthAccount_userId_idx" ON "AuthAccount"("userId");
CREATE INDEX "AuthVerification_identifier_idx" ON "AuthVerification"("identifier");
CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");
CREATE INDEX "SecurityAuditEvent_eventKey_createdAt_idx" ON "SecurityAuditEvent"("eventKey", "createdAt");
CREATE INDEX "SecurityAuditEvent_targetUserId_createdAt_idx" ON "SecurityAuditEvent"("targetUserId", "createdAt");

ALTER TABLE "User" ADD CONSTRAINT "User_authUserId_fkey" FOREIGN KEY ("authUserId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecurityAuditEvent" ADD CONSTRAINT "SecurityAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SecurityAuditEvent" ADD CONSTRAINT "SecurityAuditEvent_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
