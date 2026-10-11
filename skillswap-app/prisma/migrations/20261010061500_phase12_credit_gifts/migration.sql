CREATE TABLE "CreditGift" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "message" VARCHAR(240),
    "idempotencyKey" VARCHAR(180) NOT NULL,
    "ledgerTransactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditGift_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CreditGift_amount_range_check" CHECK ("amount" BETWEEN 1 AND 100),
    CONSTRAINT "CreditGift_sender_recipient_check" CHECK ("senderId" <> "recipientId")
);

CREATE UNIQUE INDEX "CreditGift_idempotencyKey_key" ON "CreditGift"("idempotencyKey");
CREATE UNIQUE INDEX "CreditGift_ledgerTransactionId_key" ON "CreditGift"("ledgerTransactionId");
CREATE INDEX "CreditGift_senderId_createdAt_idx" ON "CreditGift"("senderId", "createdAt");
CREATE INDEX "CreditGift_recipientId_createdAt_idx" ON "CreditGift"("recipientId", "createdAt");

ALTER TABLE "CreditGift"
    ADD CONSTRAINT "CreditGift_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditGift"
    ADD CONSTRAINT "CreditGift_recipientId_fkey"
    FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CreditGift"
    ADD CONSTRAINT "CreditGift_ledgerTransactionId_fkey"
    FOREIGN KEY ("ledgerTransactionId") REFERENCES "CreditLedgerTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
