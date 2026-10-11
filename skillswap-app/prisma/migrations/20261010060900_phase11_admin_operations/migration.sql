CREATE TYPE "AdminQueuePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TABLE "AdminQueueAssignment" (
    "id" TEXT NOT NULL,
    "itemType" VARCHAR(30) NOT NULL,
    "itemId" VARCHAR(100) NOT NULL,
    "priority" "AdminQueuePriority" NOT NULL DEFAULT 'NORMAL',
    "assigneeId" TEXT,
    "updatedById" TEXT NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminQueueAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminQueueAssignment_itemType_itemId_key"
    ON "AdminQueueAssignment"("itemType", "itemId");
CREATE INDEX "AdminQueueAssignment_assigneeId_priority_updatedAt_idx"
    ON "AdminQueueAssignment"("assigneeId", "priority", "updatedAt");
CREATE INDEX "AdminQueueAssignment_itemType_priority_updatedAt_idx"
    ON "AdminQueueAssignment"("itemType", "priority", "updatedAt");

ALTER TABLE "AdminQueueAssignment"
    ADD CONSTRAINT "AdminQueueAssignment_assigneeId_fkey"
    FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminQueueAssignment"
    ADD CONSTRAINT "AdminQueueAssignment_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION prevent_security_audit_mutation() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Security audit events are append-only';
    END IF;
    IF ROW(NEW."id", NEW."eventKey", NEW."reason", NEW."details", NEW."createdAt")
       IS DISTINCT FROM ROW(OLD."id", OLD."eventKey", OLD."reason", OLD."details", OLD."createdAt")
       OR (NEW."actorId" IS DISTINCT FROM OLD."actorId" AND NEW."actorId" IS NOT NULL)
       OR (NEW."targetUserId" IS DISTINCT FROM OLD."targetUserId" AND NEW."targetUserId" IS NOT NULL) THEN
        RAISE EXCEPTION 'Security audit event content is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "SecurityAuditEvent_append_only"
    BEFORE UPDATE OR DELETE ON "SecurityAuditEvent"
    FOR EACH ROW EXECUTE FUNCTION prevent_security_audit_mutation();
