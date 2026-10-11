import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireMember } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { deletePrivateR2Object, uploadPrivateR2Object } from "@/lib/storage/r2";

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;
const allowed = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

function matchesFileSignature(type: string, bytes: Uint8Array) {
  if (type === "application/pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (type === "image/png") return bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10";
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/webp")
    return (
      new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
    );
  return false;
}

function redirectWithStatus(request: Request, status: string) {
  const url = new URL("/verifications", request.url);
  url.searchParams.set("notice", status);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const member = await requireMember();
  const form = await request.formData();
  const requestId = String(form.get("requestId") ?? "").trim();
  const file = form.get("evidence");
  if (
    !requestId ||
    !(file instanceof File) ||
    file.size < 1 ||
    file.size > MAX_BYTES ||
    !allowed.has(file.type)
  )
    return redirectWithStatus(request, "invalid-evidence");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesFileSignature(file.type, bytes))
    return redirectWithStatus(request, "invalid-evidence");
  const prisma = getPrismaClient();
  const verification = await prisma.verificationRequest.findFirst({
    where: {
      id: requestId,
      userId: member.id,
      status: { in: ["PENDING", "IN_REVIEW"] },
      evidenceObjectKey: null,
    },
    select: { id: true },
  });
  if (!verification) return redirectWithStatus(request, "request-not-uploadable");

  const objectKey = `verification/${member.id}/${verification.id}/${randomUUID()}`;
  try {
    await uploadPrivateR2Object(objectKey, Buffer.from(bytes), file.type);
  } catch {
    return redirectWithStatus(request, "storage-unavailable");
  }
  const saved = await prisma.verificationRequest.updateMany({
    where: {
      id: verification.id,
      userId: member.id,
      evidenceObjectKey: null,
      status: { in: ["PENDING", "IN_REVIEW"] },
    },
    data: { evidenceObjectKey: objectKey, evidenceContentType: file.type, evidenceSize: file.size },
  });
  if (saved.count !== 1) {
    try {
      await deletePrivateR2Object(objectKey);
    } catch {
      console.error("Orphaned verification object needs retention cleanup", {
        requestId: verification.id,
      });
    }
    return redirectWithStatus(request, "request-not-uploadable");
  }
  return redirectWithStatus(request, "evidence-uploaded");
}
