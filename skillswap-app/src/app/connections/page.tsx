import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { disconnectMember } from "@/app/messages/actions";

export default async function ConnectionsPage() {
  const member = await requireMemberPage();
  const prisma = getPrismaClient();
  const blocked = await prisma.profileBlock.findMany({
    where: { OR: [{ blockerId: member.id }, { blockedUserId: member.id }] },
    select: { blockerId: true, blockedUserId: true },
  });
  const blockedIds = blocked.map((b) =>
    b.blockerId === member.id ? b.blockedUserId : b.blockerId,
  );
  const connections = await prisma.connection.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { memberLowId: member.id, memberHighId: { notIn: blockedIds } },
        { memberHighId: member.id, memberLowId: { notIn: blockedIds } },
      ],
    },
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
      conversations: {
        where: { isActive: true },
        orderBy: { lastMessageAt: "desc" },
        take: 1,
        include: {
          participants: { where: { userId: member.id }, select: { unreadCount: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true, createdAt: true, senderId: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
  return (
    <main className="interaction-page">
      <header className="interaction-header">
        <div>
          <p className="section-kicker">YOUR COMMUNITY</p>
          <h1>Connections</h1>
          <p>Members you connected with after accepting a learning or exchange request.</p>
        </div>
        <nav className="interaction-nav">
          <Link href="/requests">Learning requests</Link>
          <Link href="/exchanges">Exchange requests</Link>
          <Link href="/sessions">Sessions</Link>
          <Link href="/member">Workspace</Link>
        </nav>
      </header>
      <section className="interaction-panel">
        <h2>Active connections</h2>
        {connections.length ? (
          <div className="connection-list">
            {connections.map((c) => {
              const other = c.memberLowId === member.id ? c.memberHigh : c.memberLow;
              const conversation = c.conversations[0];
              const allowed =
                c.memberLow.memberProfile?.acceptMessages &&
                c.memberHigh.memberProfile?.acceptMessages;
              const unread = conversation?.participants[0]?.unreadCount ?? 0;
              return (
                <article className="connection-card" key={c.id}>
                  <div className="connection-card-main">
                    <div>
                      <h3>{other.memberProfile?.displayName || "SkillSwap Member"}</h3>
                      <p>
                        {conversation?.messages[0]?.body
                          ? conversation.messages[0].body.slice(0, 100)
                          : "You are connected."}
                      </p>
                    </div>
                    {unread > 0 && <span className="unread-badge">{unread} unread</span>}
                  </div>
                  <div className="connection-actions">
                    {conversation && (
                      <Link className="primary-button" href={"/messages/" + conversation.id}>
                        {allowed ? "Open messages" : "View conversation"}
                      </Link>
                    )}
                    <Link className="secondary-button" href={"/profiles/" + other.id}>
                      View profile
                    </Link>
                    <form action={disconnectMember}>
                      <input type="hidden" name="connectionId" value={c.id} />
                      <button className="danger-button">Disconnect</button>
                    </form>
                  </div>
                  {!allowed && (
                    <p className="form-hint">
                      One member has paused new messages. Existing conversation history remains
                      visible.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No connections yet</h3>
            <p>Accept a learning request response or exchange invitation to connect.</p>
            <Link href="/requests">Browse learning requests</Link>
          </div>
        )}
      </section>
    </main>
  );
}
