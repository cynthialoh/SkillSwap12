import { NextResponse } from "next/server";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { getProfileViewForMember } from "@/lib/profile-dto";
import { signPrivateR2Url } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const member = await requireMember();
  const { userId } = await params;
  if (member.id !== userId) {
    const profile = await getProfileViewForMember(member.id, userId);
    if (!profile || profile.kind === "private-preview")
      return new NextResponse(null, { status: 404 });
  }
  const image = await getPrismaClient().memberProfile.findUnique({
    where: { userId },
    select: { profileImageObjectKey: true },
  });
  if (!image?.profileImageObjectKey) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(signPrivateR2Url("GET", image.profileImageObjectKey, 3600), {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
