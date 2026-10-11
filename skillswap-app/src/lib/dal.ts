import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPrismaClient } from "@/lib/db/prisma";

export class AccessDeniedError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function getActor() {
  const session = await getSession();
  if (!session?.user || !session.user.emailVerified) return null;

  const user = await getPrismaClient().user.findUnique({
    where: { authUserId: session.user.id },
    select: {
      id: true,
      status: true,
      adminGrant: { select: { userId: true } },
      memberProfile: {
        select: {
          displayName: true,
          bio: true,
          location: true,
          timezone: true,
          teachSkills: true,
          learnSkills: true,
          availability: true,
          isDiscoverable: true,
          onboardingCompletedAt: true,
        },
      },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    status: user.status,
    isAdmin: Boolean(user.adminGrant),
    profile: user.memberProfile,
  };
}

export async function requireMember() {
  const actor = await getActor();
  if (!actor) throw new AccessDeniedError(401, "Sign in with a verified email to continue.");
  if (actor.status !== "ACTIVE")
    throw new AccessDeniedError(403, "This account is currently unavailable.");
  if (actor.isAdmin) throw new AccessDeniedError(403, "This area is for Member accounts.");
  return actor;
}

export async function requireAdmin() {
  const actor = await getActor();
  if (!actor) throw new AccessDeniedError(401, "Sign in with a verified email to continue.");
  if (actor.status !== "ACTIVE" || !actor.isAdmin) {
    throw new AccessDeniedError(403, "Admin access is required.");
  }
  return actor;
}

export function requireOwnership(actorId: string, resourceOwnerId: string) {
  if (actorId !== resourceOwnerId)
    throw new AccessDeniedError(403, "You do not have access to this resource.");
}

export async function requireMemberPage() {
  let actor;
  try {
    actor = await requireMember();
  } catch (error) {
    if (error instanceof AccessDeniedError && error.status === 401) redirect("/sign-in");
    throw error;
  }
  if (!actor.profile?.onboardingCompletedAt) redirect("/onboarding");
  return actor;
}
