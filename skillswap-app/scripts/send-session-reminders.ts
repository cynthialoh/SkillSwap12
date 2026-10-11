import "dotenv/config";
import { getPrismaClient } from "../src/lib/db/prisma";
import { sendTransactionalEmail } from "../src/lib/email/zeptomail";

function formatSessionTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
    timeZoneName: "short",
  }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const prisma = getPrismaClient();
const now = new Date();
const staleClaimBefore = new Date(now.getTime() - 10 * 60 * 1000);
const reminders = await prisma.sessionReminder.findMany({
  where: {
    sentAt: null,
    scheduledFor: { lte: now },
    OR: [{ claimedAt: null }, { claimedAt: { lt: staleClaimBefore } }],
    session: { status: "CONFIRMED", startsAt: { gt: now } },
  },
  include: {
    user: {
      select: {
        authUser: { select: { email: true } },
        memberProfile: { select: { displayName: true, timezone: true } },
        notificationPreference: { select: { emailSessions: true } },
      },
    },
    session: {
      select: {
        id: true,
        startsAt: true,
        learnerId: true,
        learner: { select: { memberProfile: { select: { displayName: true } } } },
        teacher: { select: { memberProfile: { select: { displayName: true } } } },
        exchangeRequest: { select: { targetSkillName: true } },
      },
    },
  },
  orderBy: { scheduledFor: "asc" },
  take: 100,
});

let sent = 0;
for (const reminder of reminders) {
  const claimed = await prisma.sessionReminder.updateMany({
    where: {
      id: reminder.id,
      sentAt: null,
      OR: [{ claimedAt: null }, { claimedAt: { lt: staleClaimBefore } }],
    },
    data: { claimedAt: now, attempts: { increment: 1 } },
  });
  if (!claimed.count) continue;
  if (reminder.user.notificationPreference?.emailSessions === false) {
    await prisma.sessionReminder.update({
      where: { id: reminder.id },
      data: { sentAt: new Date(), claimedAt: null },
    });
    continue;
  }
  const email = reminder.user.authUser?.email;
  try {
    if (!email) throw new Error("Participant email is unavailable.");
    const start = reminder.session.startsAt;
    if (!start) throw new Error("Confirmed session has no scheduled time.");
    const partner =
      reminder.userId === reminder.session.learnerId
        ? reminder.session.teacher.memberProfile?.displayName
        : reminder.session.learner.memberProfile?.displayName;
    const when = formatSessionTime(start, reminder.user.memberProfile?.timezone || "UTC");
    const url = `${process.env.APP_BASE_URL ?? "http://127.0.0.1:3000"}/sessions/${reminder.session.id}`;
    const skillName = escapeHtml(reminder.session.exchangeRequest.targetSkillName);
    const partnerName = escapeHtml(partner || "your learning partner");
    const safeWhen = escapeHtml(when);
    await sendTransactionalEmail({
      to: email,
      subject: "Your SkillSwap session is coming up",
      text: `${reminder.session.exchangeRequest.targetSkillName} with ${partner || "your learning partner"} starts ${when}.\n\nSession details: ${url}`,
      html: `<p>Your ${skillName} session with ${partnerName} starts ${safeWhen}.</p><p><a href="${escapeHtml(url)}">Open session details</a></p>`,
    });
    await prisma.sessionReminder.update({
      where: { id: reminder.id },
      data: { sentAt: new Date(), claimedAt: null },
    });
    sent += 1;
  } catch (error) {
    await prisma.sessionReminder.update({ where: { id: reminder.id }, data: { claimedAt: null } });
    console.error("Session reminder failed", { reminderId: reminder.id, error });
  }
}

console.info(`Session reminder run finished: ${sent} sent, ${reminders.length} due.`);
await prisma.$disconnect();
