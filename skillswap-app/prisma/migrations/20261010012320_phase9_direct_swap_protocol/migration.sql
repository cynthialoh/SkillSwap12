-- CreateEnum
CREATE TYPE "DirectSwapStatus" AS ENUM ('AWAITING_SESSIONS', 'AWAITING_DEPOSITS', 'IN_PROGRESS', 'MUTUAL_CANCELLATION_PENDING', 'RESOLUTION_PENDING', 'COMPLETED_PENDING_SETTLEMENT', 'MUTUALLY_CANCELLED', 'SETTLED', 'RESOLVED');

-- AlterTable
ALTER TABLE "ExchangeRequest" ADD COLUMN     "offerSkillValueCredits" INTEGER,
ADD COLUMN     "targetSkillValueCredits" INTEGER;

-- CreateTable
CREATE TABLE "DirectSwap" (
    "id" TEXT NOT NULL,
    "exchangeRequestId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" "DirectSwapStatus" NOT NULL DEFAULT 'AWAITING_SESSIONS',
    "targetSkillValueCredits" INTEGER NOT NULL,
    "offerSkillValueCredits" INTEGER NOT NULL,
    "requesterDepositCredits" INTEGER NOT NULL,
    "recipientDepositCredits" INTEGER NOT NULL,
    "cancellationRequestedById" TEXT,
    "cancellationRequestedAt" TIMESTAMP(3),
    "cancellationConfirmedAt" TIMESTAMP(3),
    "cancellationReason" VARCHAR(500),
    "resolutionOutcome" VARCHAR(60),
    "resolutionReason" VARCHAR(1000),
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectSwap_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DirectSwap"
  ADD CONSTRAINT "DirectSwap_participants_distinct_check" CHECK ("requesterId" <> "recipientId"),
  ADD CONSTRAINT "DirectSwap_skill_values_positive_check" CHECK ("targetSkillValueCredits" > 0 AND "offerSkillValueCredits" > 0),
  ADD CONSTRAINT "DirectSwap_deposits_positive_check" CHECK ("requesterDepositCredits" > 0 AND "recipientDepositCredits" > 0);

-- CreateTable
CREATE TABLE "DirectSwapEvent" (
    "id" TEXT NOT NULL,
    "directSwapId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventKey" VARCHAR(60) NOT NULL,
    "fromState" VARCHAR(40),
    "toState" VARCHAR(40),
    "summary" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectSwapEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DirectSwap_exchangeRequestId_key" ON "DirectSwap"("exchangeRequestId");

-- CreateIndex
CREATE INDEX "DirectSwap_status_updatedAt_idx" ON "DirectSwap"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "DirectSwap_requesterId_status_idx" ON "DirectSwap"("requesterId", "status");

-- CreateIndex
CREATE INDEX "DirectSwap_recipientId_status_idx" ON "DirectSwap"("recipientId", "status");

-- CreateIndex
CREATE INDEX "DirectSwapEvent_directSwapId_createdAt_idx" ON "DirectSwapEvent"("directSwapId", "createdAt");

-- CreateIndex
CREATE INDEX "DirectSwapEvent_actorId_createdAt_idx" ON "DirectSwapEvent"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "DirectSwap" ADD CONSTRAINT "DirectSwap_exchangeRequestId_fkey" FOREIGN KEY ("exchangeRequestId") REFERENCES "ExchangeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSwap" ADD CONSTRAINT "DirectSwap_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSwap" ADD CONSTRAINT "DirectSwap_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSwap" ADD CONSTRAINT "DirectSwap_cancellationRequestedById_fkey" FOREIGN KEY ("cancellationRequestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSwap" ADD CONSTRAINT "DirectSwap_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSwapEvent" ADD CONSTRAINT "DirectSwapEvent_directSwapId_fkey" FOREIGN KEY ("directSwapId") REFERENCES "DirectSwap"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSwapEvent" ADD CONSTRAINT "DirectSwapEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION "reject_direct_swap_event_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Direct-swap audit events are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DirectSwapEvent_immutable"
BEFORE UPDATE OR DELETE ON "DirectSwapEvent"
FOR EACH ROW EXECUTE FUNCTION "reject_direct_swap_event_mutation"();
