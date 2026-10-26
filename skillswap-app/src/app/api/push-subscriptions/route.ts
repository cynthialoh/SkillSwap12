import { NextResponse } from "next/server";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

function parseSubscription(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const subscription = value as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  const endpoint = typeof subscription.endpoint === "string" ? subscription.endpoint : "";
  const p256dh = typeof subscription.keys?.p256dh === "string" ? subscription.keys.p256dh : "";
  const auth = typeof subscription.keys?.auth === "string" ? subscription.keys.auth : "";
  try {
    if (new URL(endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  if (endpoint.length > 2048 || !p256dh || p256dh.length > 256 || !auth || auth.length > 256)
    return null;
  return { endpoint, p256dh, auth };
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const subscription = parseSubscription(await request.json());
    if (!subscription) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    await getPrismaClient().webPushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: { userId: member.id, ...subscription },
      update: { userId: member.id, p256dh: subscription.p256dh, auth: subscription.auth },
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Sign in to enable notifications" }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  try {
    const member = await requireMember();
    const body = (await request.json()) as { endpoint?: unknown };
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    if (!endpoint || endpoint.length > 2048)
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    await getPrismaClient().webPushSubscription.deleteMany({
      where: { userId: member.id, endpoint },
    });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Sign in to manage notifications" }, { status: 401 });
  }
}
