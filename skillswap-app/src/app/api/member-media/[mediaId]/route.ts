import { NextResponse } from "next/server";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { getProfileViewForMember } from "@/lib/profile-dto";
import { signPrivateR2Url } from "@/lib/storage/r2";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const member = await requireMember();
  const { mediaId } = await params;
  const media = await getPrismaClient().memberMedia.findUnique({
    where: { id: mediaId },
    select: {
      userId: true,
      objectKey: true,
      communityPostId: true,
      contentType: true,
      communityPost: { select: { id: true, authorId: true, status: true, visibility: true } },
    },
  });
  if (!media) return new NextResponse(null, { status: 404 });

  if (media.communityPostId && media.communityPost) {
    const post = media.communityPost;
    if (post.status !== "PUBLISHED" || post.authorId !== media.userId)
      return new NextResponse(null, { status: 404 });
    if (member.id !== post.authorId) {
      const profile = await getProfileViewForMember(member.id, post.authorId);
      if (!profile || profile.kind === "private-preview")
        return new NextResponse(null, { status: 404 });
      if (post.visibility === "FOLLOWERS") {
        const follows = await getPrismaClient().followedPerson.findUnique({
          where: { userId_personId: { userId: member.id, personId: post.authorId } },
          select: { userId: true },
        });
        if (!follows) return new NextResponse(null, { status: 404 });
      }
    }
  } else if (member.id !== media.userId) {
    const profile = await getProfileViewForMember(member.id, media.userId);
    if (!profile || profile.kind === "private-preview")
      return new NextResponse(null, { status: 404 });
  }

  return NextResponse.redirect(signPrivateR2Url("GET", media.objectKey, 3600), {
    headers: { "Cache-Control": "private, no-store, max-age=0", "Content-Type": media.contentType },
  });
}
