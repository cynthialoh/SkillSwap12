CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralClaim" (
    "id" TEXT NOT NULL,
    "referralCodeId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "qualifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardedAt" TIMESTAMP(3),
    CONSTRAINT "ReferralClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralCode_userId_key" ON "ReferralCode"("userId");
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");
CREATE INDEX "ReferralCode_createdAt_idx" ON "ReferralCode"("createdAt");
CREATE UNIQUE INDEX "ReferralClaim_inviteeId_key" ON "ReferralClaim"("inviteeId");
CREATE INDEX "ReferralClaim_referralCodeId_qualifiedAt_idx" ON "ReferralClaim"("referralCodeId", "qualifiedAt");
CREATE INDEX "ReferralClaim_rewardedAt_idx" ON "ReferralClaim"("rewardedAt");

ALTER TABLE "ReferralCode"
ADD CONSTRAINT "ReferralCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReferralClaim"
ADD CONSTRAINT "ReferralClaim_referralCodeId_fkey"
FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReferralClaim"
ADD CONSTRAINT "ReferralClaim_inviteeId_fkey"
FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
