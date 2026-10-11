import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "@/lib/db/prisma";

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main() {
  const email = arg("--email")?.trim().toLowerCase();
  const reason = arg("--reason")?.trim();
  const grantedByEmail = arg("--granted-by")?.trim().toLowerCase();
  if (!email || !reason || reason.length > 500) {
    throw new Error(
      'Usage: npm run admin:grant -- --email user@example.com --reason "Operational need" [--granted-by admin@example.com]',
    );
  }

  const prisma = getPrismaClient();
  const [targetAuth, grantCount] = await Promise.all([
    prisma.authUser.findUnique({
      where: { email },
      select: { id: true, emailVerified: true, appUser: { select: { id: true } } },
    }),
    prisma.adminGrant.count(),
  ]);
  if (!targetAuth?.emailVerified || !targetAuth.appUser)
    throw new Error("Target must have a verified SkillSwap account.");

  let actorId: string | null = null;
  const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const recovery = grantCount > 0 && process.env.BOOTSTRAP_ADMIN_RECOVERY === "true";
  if (grantCount === 0 || recovery) {
    if (email !== bootstrapEmail || grantedByEmail) {
      throw new Error(
        "Bootstrap provisioning must match BOOTSTRAP_ADMIN_EMAIL and omit --granted-by. Recovery also requires BOOTSTRAP_ADMIN_RECOVERY=true.",
      );
    }
  } else {
    if (!grantedByEmail) throw new Error("A current Admin email is required with --granted-by.");
    const operator = await prisma.authUser.findUnique({
      where: { email: grantedByEmail },
      select: {
        id: true,
        emailVerified: true,
        appUser: { select: { id: true, adminGrant: { select: { userId: true } } } },
      },
    });
    if (!operator?.emailVerified || !operator.appUser?.adminGrant)
      throw new Error("The granting operator must be a verified Admin.");
    actorId = operator.appUser.id;
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.adminGrant.create({
      data: { userId: targetAuth.appUser!.id, grantedById: actorId, reason },
    });
    await transaction.securityAuditEvent.create({
      data: {
        eventKey: "admin.grant.created",
        actorId,
        targetUserId: targetAuth.appUser!.id,
        reason,
        details: {
          targetEmail: email,
          bootstrap: actorId === null,
          recovery: actorId === null && recovery,
          requestId: randomUUID(),
        },
      },
    });
  });
  console.info(`Admin access granted to ${email}.`);
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Admin provisioning failed.");
  process.exitCode = 1;
});
