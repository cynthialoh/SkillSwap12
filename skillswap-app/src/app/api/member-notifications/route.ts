import { NextResponse } from "next/server";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const rawSince = new URL(request.url).searchParams.get("since");
    const parsedSince = rawSince ? new Date(rawSince) : new Date(Date.now() - 30_000);
    const since = Number.isNaN(parsedSince.getTime()) ? new Date(Date.now() - 30_000) : parsedSince;
    const notifications = await getPrismaClient().notification.findMany({
      where: { recipientId: member.id, inApp: true, createdAt: { gt: since } },
      orderBy: { createdAt: "asc" },
      take: 25,
      select: { id: true, title: true, body: true, href: true, createdAt: true },
    });
    return NextResponse.json(
      {
        notices: notifications.map(({ id, title, body, href }) => ({ id, title, body, href })),
        latest: notifications.at(-1)?.createdAt.toISOString() ?? null,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
}
