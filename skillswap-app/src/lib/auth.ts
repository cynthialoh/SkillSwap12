import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { getPrismaClient } from "@/lib/db/prisma";
import { sendTransactionalEmail } from "@/lib/email/zeptomail";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret && process.env.NODE_ENV === "production") {
  throw new Error("BETTER_AUTH_SECRET must be configured before starting SkillSwap.");
}

const prisma = getPrismaClient();

function sendAuthLink(to: string, subject: string, url: string, label: string) {
  const text = `${label}: ${url}\n\nIf you did not request this, you can ignore this email.`;
  return sendTransactionalEmail({
    to,
    subject,
    text,
    html: `<p>${label}</p><p><a href="${url}">${label}</a></p><p>If you did not request this, you can ignore this email.</p>`,
  });
}

export const auth = betterAuth({
  appName: "SkillSwap",
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_BASE_URL ?? "http://127.0.0.1:3000",
  secret: secret ?? "skillswap-development-secret-change-before-deploy-2026",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthLink(
        user.email,
        "Reset your SkillSwap password",
        url,
        "Reset your password",
      ).catch(() => {
        console.error("SkillSwap password reset email could not be delivered.");
        throw new Error("Password reset email could not be delivered.");
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthLink(
        user.email,
        "Verify your SkillSwap email",
        url,
        "Verify your email address",
      ).catch(() => {
        console.error("SkillSwap verification email could not be delivered.");
        throw new Error("Verification email could not be delivered.");
      });
    },
  },
  user: {
    modelName: "AuthUser",
  },
  session: {
    modelName: "AuthSession",
  },
  account: {
    modelName: "AuthAccount",
  },
  verification: {
    modelName: "AuthVerification",
  },
  databaseHooks: {
    user: {
      create: {
        after: async (authUser) => {
          await prisma.$transaction(async (transaction) => {
            const appUser = await transaction.user.upsert({
              where: { authUserId: authUser.id },
              create: { authUserId: authUser.id },
              update: {},
            });
            await transaction.memberProfile.upsert({
              where: { userId: appUser.id },
              create: { userId: appUser.id, displayName: authUser.name },
              update: {},
            });
            await transaction.identity.upsert({
              where: { provider_subject: { provider: "better-auth", subject: authUser.id } },
              create: { userId: appUser.id, provider: "better-auth", subject: authUser.id },
              update: { userId: appUser.id },
            });
          });
        },
      },
    },
  },
  plugins: [nextCookies()],
});
