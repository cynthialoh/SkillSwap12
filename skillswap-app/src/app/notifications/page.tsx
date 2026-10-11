import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { markAllNotificationsRead, markNotificationRead } from "./actions";

export default async function NotificationsPage() {
  const member = await requireMemberPage();
  const prisma = getPrismaClient();
  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { recipientId: member.id, inApp: true },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        category: true,
        title: true,
        body: true,
        href: true,
        createdAt: true,
        readAt: true,
      },
    }),
    prisma.notification.count({ where: { recipientId: member.id, inApp: true, readAt: null } }),
  ]);
  return (
    <main className="interaction-page">
      <header className="interaction-header">
        <div>
          <p className="section-kicker">YOUR ACTIVITY</p>
          <h1>Notifications</h1>
          <p>
            {unread} unread notification{unread === 1 ? "" : "s"}.
          </p>
        </div>
        <nav className="interaction-nav">
          <Link href="/notifications/preferences">Notification settings</Link>
          <Link href="/community">Community</Link>
          <Link href="/member">Workspace</Link>
        </nav>
      </header>
      {unread > 0 && (
        <form action={markAllNotificationsRead}>
          <button className="secondary-button">Mark all as read</button>
        </form>
      )}
      <section className="interaction-panel notification-list">
        {notifications.length ? (
          notifications.map((notification) => (
            <article
              className={`notification-row${notification.readAt ? "" : " unread"}`}
              key={notification.id}
            >
              <div>
                <p className="section-kicker">{notification.category.toLowerCase()}</p>
                <h2>{notification.title}</h2>
                <p>{notification.body}</p>
                <small>{notification.createdAt.toLocaleString()}</small>
              </div>
              <div className="notification-actions">
                <Link className="secondary-button" href={notification.href}>
                  Open
                </Link>
                {!notification.readAt && (
                  <form action={markNotificationRead}>
                    <input type="hidden" name="notificationId" value={notification.id} />
                    <button className="text-link">Mark read</button>
                  </form>
                )}
              </div>
            </article>
          ))
        ) : (
          <p className="empty-state">
            You’re all caught up. Activity from your learning community will appear here.
          </p>
        )}
      </section>
    </main>
  );
}
