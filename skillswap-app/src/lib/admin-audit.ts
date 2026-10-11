import "server-only";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";

type AuditWriter = Pick<Prisma.TransactionClient, "securityAuditEvent">;

type AdminAuditInput = {
  eventKey: string;
  actorId: string | null;
  targetUserId?: string | null;
  reason?: string | null;
  details?: Prisma.InputJsonObject;
};

/** Write an attributable, immutable audit row with a per-action request identifier. */
export async function writeAdminAuditEvent(writer: AuditWriter, input: AdminAuditInput) {
  const requestId = randomUUID();
  return writer.securityAuditEvent.create({
    data: {
      eventKey: input.eventKey,
      actorId: input.actorId,
      targetUserId: input.targetUserId ?? null,
      reason: input.reason ?? null,
      details: { ...(input.details ?? {}), requestId },
    },
  });
}
