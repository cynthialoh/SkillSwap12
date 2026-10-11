CREATE TABLE "CreditCode" (
  "id" TEXT NOT NULL,
  "codeHash" VARCHAR(64) NOT NULL,
  "codePrefix" VARCHAR(16) NOT NULL,
  "amount" INTEGER NOT NULL,
  "maxRedemptions" INTEGER NOT NULL,
  "redemptionCount" INTEGER NOT NULL DEFAULT 0,
  "reason" VARCHAR(500) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditCode_amount_positive_check" CHECK ("amount" > 0),
  CONSTRAINT "CreditCode_redemption_limits_check" CHECK (
    "maxRedemptions" > 0 AND "redemptionCount" >= 0 AND "redemptionCount" <= "maxRedemptions"
  )
);

CREATE TABLE "CreditCodeRedemption" (
  "id" TEXT NOT NULL,
  "creditCodeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "ledgerTransactionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditCodeRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CreditCode_codeHash_key" ON "CreditCode"("codeHash");
CREATE INDEX "CreditCode_isActive_expiresAt_idx" ON "CreditCode"("isActive", "expiresAt");
CREATE INDEX "CreditCode_createdById_createdAt_idx" ON "CreditCode"("createdById", "createdAt");
CREATE UNIQUE INDEX "CreditCodeRedemption_ledgerTransactionId_key" ON "CreditCodeRedemption"("ledgerTransactionId");
CREATE UNIQUE INDEX "CreditCodeRedemption_creditCodeId_userId_key" ON "CreditCodeRedemption"("creditCodeId", "userId");
CREATE INDEX "CreditCodeRedemption_userId_createdAt_idx" ON "CreditCodeRedemption"("userId", "createdAt");

ALTER TABLE "CreditCode" ADD CONSTRAINT "CreditCode_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditCodeRedemption" ADD CONSTRAINT "CreditCodeRedemption_creditCodeId_fkey"
  FOREIGN KEY ("creditCodeId") REFERENCES "CreditCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditCodeRedemption" ADD CONSTRAINT "CreditCodeRedemption_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditCodeRedemption" ADD CONSTRAINT "CreditCodeRedemption_ledgerTransactionId_fkey"
  FOREIGN KEY ("ledgerTransactionId") REFERENCES "CreditLedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
