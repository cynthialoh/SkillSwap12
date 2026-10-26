import "server-only";
import webPush from "web-push";
import { getPrismaClient } from "@/lib/db/prisma";

type PushPayload = { title: string; body: string; href: string };

export async function sendWebPushToMember(userId: string, payload: PushPayload) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return;

  const subscriptions = await getPrismaClient().webPushSubscription.findMany({
    where: { userId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (!subscriptions.length) return;

  webPush.setVapidDetails("https://skillswap110.netlify.app", publicKey, privateKey);
  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
        { TTL: 60 * 60, urgency: "high" },
      ),
    ),
  );
  const expiredIds = results.flatMap((result, index) => {
    if (result.status !== "rejected") return [];
    const statusCode = (result.reason as { statusCode?: number } | undefined)?.statusCode;
    if (statusCode === 404 || statusCode === 410) return [subscriptions[index].id];
    console.error("Web push delivery failed", { statusCode, userId });
    return [];
  });
  if (expiredIds.length) {
    await getPrismaClient().webPushSubscription.deleteMany({ where: { id: { in: expiredIds } } });
  }
}
