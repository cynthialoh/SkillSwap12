import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { deletePrivateR2Object } from "../src/lib/storage/r2";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const expired = await prisma.verificationRequest.findMany({
    where: { evidenceDeleteAt: { lte: new Date() }, evidenceObjectKey: { not: null } },
    select: { id: true, userId: true, evidenceObjectKey: true },
    take: 200,
  });
  for (const request of expired) {
    if (!request.evidenceObjectKey) continue;
    await deletePrivateR2Object(request.evidenceObjectKey);
    await prisma.$transaction([
      prisma.verificationRequest.update({
        where: { id: request.id },
        data: {
          evidenceObjectKey: null,
          evidenceContentType: null,
          evidenceSize: null,
          evidenceDeleteAt: null,
        },
      }),
      prisma.securityAuditEvent.create({
        data: {
          eventKey: "VERIFICATION_EVIDENCE_DELETED_RETENTION",
          targetUserId: request.userId,
          reason: "Private verification evidence was deleted after its retention period.",
          details: { requestId: request.id },
        },
      }),
    ]);
  }
  console.info(`Deleted ${expired.length} expired verification evidence object(s).`);
} finally {
  await prisma.$disconnect();
}
