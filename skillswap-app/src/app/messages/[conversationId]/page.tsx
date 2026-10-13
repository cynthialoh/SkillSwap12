import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { assertCanReadConversation } from "@/lib/interaction-policy";
import { sendMessage } from "../actions";

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<{ page?: string; error?: string }>;
}) {
  const member = await requireMemberPage();
  const { conversationId } = await params;
  try {
    await assertCanReadConversation(member.id, conversationId);
  } catch {
    notFound();
  }
  const prisma = getPrismaClient();
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      connection: {
        include: {
          memberLow: {
            select: {
              id: true,
              memberProfile: { select: { displayName: true, acceptMessages: true } },
            },
          },
          memberHigh: {
            select: {
              id: true,
              memberProfile: { select: { displayName: true, acceptMessages: true } },
            },
          },
        },
      },
      participants: { where: { userId: member.id }, select: { lastReadAt: true } },
    },
  });
  if (!conversation) notFound();
  const other =
    conversation.connection.memberLowId === member.id
      ? conversation.connection.memberHigh
      : conversation.connection.memberLow;
  const canSend =
    conversation.connection.memberLow.memberProfile?.acceptMessages &&
    conversation.connection.memberHigh.memberProfile?.acceptMessages;
  const page = Math.max(1, Math.min(1000, Number((await searchParams).page) || 1));
  if (page === 1) {
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: member.id } },
      data: { lastReadAt: new Date(), unreadCount: 0 },
    });
  }
  const pageSize = 50;
  const [messages, count] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { sender: { select: { memberProfile: { select: { displayName: true } } } } },
    }),
    prisma.message.count({ where: { conversationId } }),
  ]);
  const error = (await searchParams).error;
  return (
    <main className="interaction-page">
      <nav className="interaction-nav">
        <Link href="/connections">← Connections</Link>
        <Link href="/exchanges">Exchange requests</Link>
      </nav>
      <section className="interaction-panel conversation-panel">
        <header className="conversation-header">
          <div>
            <p className="section-kicker">PRIVATE CONVERSATION</p>
            <h1>{other.memberProfile?.displayName || "SkillSwap Member"}</h1>
            <p>Only the two connected members can read this conversation.</p>
          </div>
          <Link
            className="secondary-button"
            href={"/safety/report?reportedUserId=" + other.id + "&conversationId=" + conversationId}
          >
            Report member
          </Link>
          <Link className="conversation-session-cta" href="/sessions/new">
            <span aria-hidden="true">📅</span>
            Book a session
          </Link>
        </header>
        {error && <p className="error-notice">{error}</p>}
        {count > pageSize && (
          <nav className="message-pagination" aria-label="Message history">
            {page * pageSize < count && (
              <Link href={"/messages/" + conversationId + "?page=" + (page + 1)}>
                Older messages
              </Link>
            )}
            <span>
              Page {page} of {Math.ceil(count / pageSize)}
            </span>
            {page > 1 && (
              <Link href={"/messages/" + conversationId + "?page=" + (page - 1)}>
                Newer messages
              </Link>
            )}
          </nav>
        )}
        <div className="message-list">
          {messages.reverse().map((m) => (
            <article
              className={m.senderId === member.id ? "message-bubble own-message" : "message-bubble"}
              key={m.id}
            >
              <div className="message-meta">
                <strong>
                  {m.senderId === member.id
                    ? "You"
                    : m.sender.memberProfile?.displayName || "SkillSwap Member"}
                </strong>
                <time>{m.createdAt.toLocaleString()}</time>
              </div>
              <p>{m.body}</p>
              {m.senderId !== member.id && (
                <Link
                  className="message-report"
                  href={
                    "/safety/report?reportedUserId=" +
                    m.senderId +
                    "&conversationId=" +
                    conversationId +
                    "&messageId=" +
                    m.id
                  }
                >
                  Report message
                </Link>
              )}
            </article>
          ))}
          {!messages.length && (
            <p className="empty-state">Start the conversation with a short introduction.</p>
          )}
        </div>
        {canSend ? (
          <form action={sendMessage} className="message-compose">
            <input type="hidden" name="conversationId" value={conversationId} />
            <label htmlFor="message-body">
              Message {other.memberProfile?.displayName || "member"}
            </label>
            <textarea
              id="message-body"
              name="body"
              maxLength={4000}
              rows={3}
              required
              placeholder="Write a helpful, respectful message."
            />
            <button className="primary-button">Send message</button>
          </form>
        ) : (
          <p className="privacy-notice">
            One member has paused new messages. Conversation history remains available.
          </p>
        )}
      </section>
    </main>
  );
}
