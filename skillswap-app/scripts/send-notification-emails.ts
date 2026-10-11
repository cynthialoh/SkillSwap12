import "dotenv/config";
import { getPrismaClient } from "../src/lib/db/prisma";
import { sendTransactionalEmail } from "../src/lib/email/zeptomail";

const prisma = getPrismaClient();
const now = new Date();
const expiredClaim = new Date(now.getTime() - 10 * 60 * 1000);
const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";
const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

await prisma.emailDelivery.updateMany({
  where: { status: "PROCESSING", claimedAt: { lt: expiredClaim } },
  data: { status: "PENDING", claimedAt: null },
});

let sent = 0;
for (let batch = 0; batch < 5; batch += 1) {
  const claimed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "EmailDelivery"
      WHERE "status" = 'PENDING'::"EmailDeliveryStatus"
        AND "nextAttemptAt" <= ${now}
      ORDER BY "nextAttemptAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 20
    `;
    if (!rows.length) return [];
    await tx.emailDelivery.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, status: "PENDING" },
      data: { status: "PROCESSING", claimedAt: now, attempts: { increment: 1 } },
    });
    return tx.emailDelivery.findMany({
      where: { id: { in: rows.map((row) => row.id) }, status: "PROCESSING" },
      include: {
        notification: {
          include: {
            recipient: {
              select: {
                authUser: { select: { email: true } },
                notificationPreference: true,
              },
            },
          },
        },
      },
    });
  });

  if (!claimed.length) break;
  for (const delivery of claimed) {
    const { notification } = delivery;
    const pref = notification.recipient.notificationPreference;
    const categoryPreference = {
      MESSAGE: pref?.emailMessages ?? true,
      SESSION: pref?.emailSessions ?? true,
      COMMUNITY: pref?.emailCommunity ?? false,
      RECOMMENDATION: pref?.emailRecommendations ?? false,
      ACCOUNT: pref?.emailAccount ?? false,
    }[notification.category];
    try {
      if (!categoryPreference) {
        await prisma.emailDelivery.update({
          where: { id: delivery.id },
          data: { status: "SENT", sentAt: new Date(), claimedAt: null, lastError: null },
        });
        continue;
      }
      const email = notification.recipient.authUser?.email;
      if (!email) throw new Error("Recipient email is unavailable.");
      const url = new URL(notification.href, baseUrl).toString();
      await sendTransactionalEmail({
        to: email,
        subject: notification.title,
        text: `${notification.body}\n\nOpen SkillSwap: ${url}`,
        html: `<p>${escapeHtml(notification.body)}</p><p><a href="${escapeHtml(url)}">Open SkillSwap</a></p><p>Manage these email preferences in your SkillSwap notification settings.</p>`,
      });
      await prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: { status: "SENT", sentAt: new Date(), claimedAt: null, lastError: null },
      });
      sent += 1;
    } catch (error) {
      const retry = delivery.attempts < 5;
      const delayMinutes = Math.min(60, 2 ** Math.min(delivery.attempts, 6));
      await prisma.emailDelivery.update({
        where: { id: delivery.id },
        data: {
          status: retry ? "PENDING" : "FAILED",
          nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000),
          claimedAt: null,
          lastError:
            error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed.",
        },
      });
      console.error("Notification email delivery failed", { deliveryId: delivery.id, retry });
    }
  }
}

console.info(`Notification email run finished: ${sent} sent.`);
await prisma.$disconnect();
