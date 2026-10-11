import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const fixtureVersion = "phase8-9-credit-verification-v1";
const startingCredits = 100;
const confirmation = "I_ACKNOWLEDGE_DISPOSABLE_VERIFICATION_DATA";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function assertSafeEnvironment() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL is required.");

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(rawUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  const hostname = databaseUrl.hostname.toLowerCase();
  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, "").split("/")[0]);
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error("Credit verification fixtures are allowed only on a local PostgreSQL server.");
  }
  if (!/(^|_)(verify|verification|test)(_|$)/i.test(databaseName)) {
    throw new Error(
      `Refusing database '${databaseName}'. Use a separate local database whose name includes _verify, _verification, or _test.`,
    );
  }
  if (process.env.NODE_ENV === "production" || process.env.APP_ENV !== "verification") {
    throw new Error('Set APP_ENV="verification" and do not run this script in production.');
  }
  if (process.env.CREDIT_SETTLEMENT_ENABLED === "true") {
    throw new Error("Keep credit settlement disabled while seeding the verification database.");
  }
  if (process.env.VERIFICATION_FIXTURE_CONFIRMATION !== confirmation) {
    throw new Error(
      `Set VERIFICATION_FIXTURE_CONFIRMATION=${confirmation} after confirming this is disposable test data.`,
    );
  }

  return rawUrl;
}

async function main() {
  const emailA = argument("--member-a")?.trim().toLowerCase();
  const emailB = argument("--member-b")?.trim().toLowerCase();
  if (!emailA || !emailB || emailA === emailB) {
    throw new Error(
      'Usage: npm run verification:credits -- --member-a "learner@example.test" --member-b "teacher@example.test"',
    );
  }

  const connectionString = assertSafeEnvironment();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const members = await Promise.all(
      [emailA, emailB].map((email) =>
        prisma.authUser.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: {
            id: true,
            email: true,
            emailVerified: true,
            appUser: { select: { id: true, status: true } },
          },
        }),
      ),
    );
    if (
      members.some(
        (account) =>
          !account?.emailVerified || !account.appUser || account.appUser.status !== "ACTIVE",
      )
    ) {
      throw new Error(
        "Both addresses must belong to verified, active Member accounts in this database.",
      );
    }

    const [memberA, memberB] = members as NonNullable<(typeof members)[number]>[];
    const memberUsers = [memberA.appUser!, memberB.appUser!];
    const idempotencyKeys = memberUsers.map(
      (member) => `verification-fixture:${fixtureVersion}:${member.id}`,
    );

    await prisma.$transaction(async (tx) => {
      const existing = await tx.creditLedgerTransaction.findMany({
        where: { idempotencyKey: { in: idempotencyKeys } },
        select: { idempotencyKey: true },
      });
      if (existing.length === idempotencyKeys.length) return;
      if (existing.length > 0) {
        throw new Error("Only part of this fixture exists; refusing to change the ledger.");
      }

      const priorEntries = await tx.creditLedgerEntry.count({
        where: { account: { userId: { in: memberUsers.map((member) => member.id) } } },
      });
      if (priorEntries > 0) {
        throw new Error(
          "These Members already have ledger history. Use fresh synthetic accounts in the verification database.",
        );
      }

      const reserve = await tx.creditAccount.upsert({
        where: { code: "system:admin_adjustment" },
        create: { code: "system:admin_adjustment", type: "ADMIN_ADJUSTMENT" },
        update: {},
        select: { id: true },
      });

      for (const member of memberUsers) {
        const spendable = await tx.creditAccount.upsert({
          where: { code: `member:${member.id}:member_spendable` },
          create: {
            code: `member:${member.id}:member_spendable`,
            userId: member.id,
            type: "MEMBER_SPENDABLE",
          },
          update: {},
          select: { id: true },
        });
        const idempotencyKey = `verification-fixture:${fixtureVersion}:${member.id}`;
        await tx.creditLedgerTransaction.create({
          data: {
            idempotencyKey,
            type: "ADMIN_ADJUSTMENT",
            reason:
              "Disposable verification fixture. Synthetic credits; no purchase or cash value.",
            metadata: { fixture: fixtureVersion, synthetic: true },
            entries: {
              create: [
                { accountId: spendable.id, amount: startingCredits, source: "ADMIN_ADJUSTMENT" },
                { accountId: reserve.id, amount: -startingCredits, source: "ADMIN_ADJUSTMENT" },
              ],
            },
          },
        });
      }
    });

    console.info(
      `Verification fixture is ready for ${emailA} and ${emailB}: ${startingCredits} synthetic credits each. No existing ledger entries were changed.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Credit verification setup failed.");
  process.exitCode = 1;
});
