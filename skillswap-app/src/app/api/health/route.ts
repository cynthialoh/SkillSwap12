import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  return NextResponse.json(
    { status: "ok", service: "skillswap-web" },
    { headers: { "cache-control": "no-store", "x-request-id": requestId } },
  );
}
