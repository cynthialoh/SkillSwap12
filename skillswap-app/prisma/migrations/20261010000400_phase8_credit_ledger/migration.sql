-- CreateEnum
CREATE TYPE "CreditAccountType" AS ENUM ('MEMBER_SPENDABLE', 'MEMBER_HELD', 'PLATFORM_RESERVE', 'PLATFORM_REVENUE', 'PURCHASE_CLEARING', 'PROMOTION_RESERVE', 'REFERRAL_RESERVE', 'GIFT_RESERVE', 'REFUND_CLEARING', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CreditTransactionType" AS ENUM ('PURCHASE', 'SESSION_HOLD', 'HOLD_RELEASE', 'SESSION_SETTLEMENT', 'REFUND', 'GIFT', 'PROMOTION', 'REFERRAL', 'PLATFORM_RETENTION', 'ADMIN_ADJUSTMENT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "CreditSource" AS ENUM ('SESSION_PAYMENT', 'SESSION_HOLD', 'HOLD_RELEASE', 'PURCHASED', 'TEACHING', 'PROMOTIONAL', 'REFERRAL', 'GIFT', 'REFUND', 'PLATFORM_RETENTION', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CreditHoldStatus" AS ENUM ('ACTIVE', 'RELEASED', 'SETTLED', 'FROZEN');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "priceCredits" INTEGER;

ALTER TABLE "Session" ADD CONSTRAINT "Session_priceCredits_positive_check"
CHECK ("priceCredits" IS NULL OR "priceCredits" > 0);

-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(180) NOT NULL,
    "userId" TEXT,
    "type" "CreditAccountType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedgerTransaction" (
    "id" TEXT NOT NULL,
    "idempotencyKey" VARCHAR(180) NOT NULL,
    "type" "CreditTransactionType" NOT NULL,
    "actorId" TEXT,
    "sessionId" TEXT,
    "reason" VARCHAR(500),
    "metadata" JSONB,
    "reversalOfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" "CreditSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedgerEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreditLedgerEntry_amount_nonzero_check" CHECK ("amount" <> 0)
);

-- CreateTable
CREATE TABLE "CreditHold" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "CreditHoldStatus" NOT NULL DEFAULT 'ACTIVE',
    "holdTransactionId" TEXT NOT NULL,
    "closeTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "CreditHold_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreditHold_amount_positive_check" CHECK ("amount" > 0)
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditAccount_code_key" ON "CreditAccount"("code");

-- CreateIndex
CREATE INDEX "CreditAccount_userId_type_idx" ON "CreditAccount"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedgerTransaction_idempotencyKey_key" ON "CreditLedgerTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CreditLedgerTransaction_type_createdAt_idx" ON "CreditLedgerTransaction"("type", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedgerTransaction_actorId_createdAt_idx" ON "CreditLedgerTransaction"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedgerTransaction_sessionId_createdAt_idx" ON "CreditLedgerTransaction"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedgerTransaction_reversalOfId_idx" ON "CreditLedgerTransaction"("reversalOfId");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_accountId_createdAt_idx" ON "CreditLedgerEntry"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedgerEntry_source_createdAt_idx" ON "CreditLedgerEntry"("source", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedgerEntry_transactionId_accountId_key" ON "CreditLedgerEntry"("transactionId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditHold_sessionId_key" ON "CreditHold"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditHold_holdTransactionId_key" ON "CreditHold"("holdTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditHold_closeTransactionId_key" ON "CreditHold"("closeTransactionId");

-- CreateIndex
CREATE INDEX "CreditHold_userId_status_createdAt_idx" ON "CreditHold"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CreditHold_status_createdAt_idx" ON "CreditHold"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerTransaction" ADD CONSTRAINT "CreditLedgerTransaction_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerTransaction" ADD CONSTRAINT "CreditLedgerTransaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerTransaction" ADD CONSTRAINT "CreditLedgerTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "CreditLedgerTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "CreditLedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedgerEntry" ADD CONSTRAINT "CreditLedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditHold" ADD CONSTRAINT "CreditHold_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditHold" ADD CONSTRAINT "CreditHold_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditHold" ADD CONSTRAINT "CreditHold_holdTransactionId_fkey" FOREIGN KEY ("holdTransactionId") REFERENCES "CreditLedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditHold" ADD CONSTRAINT "CreditHold_closeTransactionId_fkey" FOREIGN KEY ("closeTransactionId") REFERENCES "CreditLedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every ledger transaction must contain at least two entries that balance to zero.
CREATE FUNCTION "assert_credit_ledger_transaction_balanced"() RETURNS trigger AS $$
DECLARE
  entry_count INTEGER;
  balance BIGINT;
BEGIN
  SELECT COUNT(*), COALESCE(SUM("amount"), 0)
    INTO entry_count, balance
    FROM "CreditLedgerEntry"
   WHERE "transactionId" = NEW."id";
  IF entry_count < 2 OR balance <> 0 THEN
    RAISE EXCEPTION 'Credit ledger transaction % must have at least two entries and balance to zero', NEW."id";
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER "CreditLedgerTransaction_balanced_check"
AFTER INSERT ON "CreditLedgerTransaction"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "assert_credit_ledger_transaction_balanced"();

-- Posted ledger history is append-only. Corrections must be posted as reversals.
CREATE FUNCTION "reject_credit_ledger_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Credit ledger records are immutable; post a reversal instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CreditLedgerTransaction_immutable"
BEFORE UPDATE OR DELETE ON "CreditLedgerTransaction"
FOR EACH ROW EXECUTE FUNCTION "reject_credit_ledger_mutation"();

CREATE TRIGGER "CreditLedgerEntry_immutable"
BEFORE UPDATE OR DELETE ON "CreditLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION "reject_credit_ledger_mutation"();
