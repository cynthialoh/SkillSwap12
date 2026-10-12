ALTER TABLE "CreditCode" ADD COLUMN "recipientId" TEXT;

ALTER TABLE "CreditCode"
ADD CONSTRAINT "CreditCode_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "CreditCode_recipientId_isActive_expiresAt_idx"
ON "CreditCode"("recipientId", "isActive", "expiresAt");
