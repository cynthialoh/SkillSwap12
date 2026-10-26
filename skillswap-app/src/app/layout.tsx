import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaClient } from "./pwa-client";
import { BackButton } from "@/components/back-button";
import { MemberAppNavigation } from "@/components/member-app-navigation";
import { MemberActivityPoller } from "@/components/member-activity-poller";
import { ThemeToggle } from "@/components/theme-toggle";
import { getActor } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";

export const metadata: Metadata = {
  applicationName: "SkillSwap",
  title: "SkillSwap — Your skills are currency",
  description: "A place to share what you know and learn what you need.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/skillswap-symbol.png", type: "image/png" },
      { url: "/pwa-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "SkillSwap",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f8176",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await getActor();
  const isMember = actor?.status === "ACTIVE" && !actor.isAdmin;
  let unreadNotifications = 0;
  let unreadMessages = 0;
  if (actor && isMember) {
    const [notificationCount, messageCount] = await Promise.all([
      getPrismaClient().notification.count({
        where: { recipientId: actor.id, inApp: true, readAt: null },
      }),
      getPrismaClient().conversationParticipant.aggregate({
        where: { userId: actor.id },
        _sum: { unreadCount: true },
      }),
    ]);
    unreadNotifications = notificationCount;
    unreadMessages = messageCount._sum.unreadCount ?? 0;
  }
  const notificationsAfter = new Date(Date.now() - 2_000).toISOString();
  return (
    <html lang="en">
      <body>
        {children}
        <ThemeToggle />
        {isMember && (
          <>
            <MemberActivityPoller initialCursor={notificationsAfter} />
            <MemberAppNavigation
              unreadMessages={unreadMessages}
              unreadNotifications={unreadNotifications}
            />
          </>
        )}
        <BackButton />
        <PwaClient />
      </body>
    </html>
  );
}
