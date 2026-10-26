import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { PushNotificationSettings } from "@/components/push-notification-settings";
import { saveNotificationPreferences } from "../actions";

const preferences = [
  ["inAppMessages", "In-app messages", "Messages and connection activity"],
  ["inAppSessions", "In-app sessions", "Scheduling and session changes"],
  ["inAppCommunity", "In-app community", "Comments and followed learning activity"],
  ["inAppRecommendations", "In-app recommendations", "Suggested people and learning opportunities"],
  ["inAppAccount", "In-app account notices", "Important account and credit activity"],
  ["emailMessages", "Email messages", "A notice when a Member messages you"],
  ["emailSessions", "Email sessions", "Scheduling changes and session updates"],
  ["emailCommunity", "Email community activity", "Comments and activity from Members you follow"],
  ["emailRecommendations", "Email recommendations", "Optional learning suggestions"],
  ["emailAccount", "Email account notices", "Important account and credit activity"],
] as const;

export default async function NotificationPreferencesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const member = await requireMemberPage();
  const [current, params] = await Promise.all([
    getPrismaClient().notificationPreference.findUnique({ where: { userId: member.id } }),
    searchParams,
  ]);
  const defaults: Record<string, boolean> = {
    inAppMessages: true,
    inAppSessions: true,
    inAppCommunity: true,
    inAppRecommendations: true,
    inAppAccount: true,
    emailMessages: true,
    emailSessions: true,
    emailCommunity: false,
    emailRecommendations: false,
    emailAccount: false,
  };
  const values = (current ?? defaults) as unknown as Record<string, boolean>;
  return (
    <main className="interaction-page">
      <Link className="text-link" href="/notifications">
        ← Notifications
      </Link>
      <section className="interaction-panel form-panel">
        <p className="section-kicker">YOUR PREFERENCES</p>
        <h1>Notification settings</h1>
        {params.saved && (
          <p className="success-notice">Your notification preferences have been saved.</p>
        )}
        <p>
          Choose which optional activity appears in your inbox and which transactional notices
          arrive by email. Session reminders use your saved time zone.
        </p>
        <PushNotificationSettings />
        <form action={saveNotificationPreferences} className="interaction-form preference-list">
          {preferences.map(([name, title, description]) => (
            <label className="preference-row" key={name}>
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <input type="checkbox" name={name} defaultChecked={values[name]} />
            </label>
          ))}
          <button className="primary-button">Save notification settings</button>
        </form>
      </section>
    </main>
  );
}
