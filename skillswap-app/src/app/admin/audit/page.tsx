import { getPrismaClient } from "@/lib/db/prisma";
import { AdminNavigation, AdminPageHeader, requireAdminPage } from "../admin-shared";

type Search = Promise<{ q?: string; event?: string }>;

export default async function AdminAuditPage({ searchParams }: { searchParams: Search }) {
  await requireAdminPage();
  const { q = "", event = "" } = await searchParams;
  const query = q.trim().slice(0, 100);
  const eventKey = event.trim().slice(0, 80);
  const events = await getPrismaClient().securityAuditEvent.findMany({
    where: {
      ...(eventKey ? { eventKey: { contains: eventKey, mode: "insensitive" } } : {}),
      ...(query
        ? {
            OR: [
              { reason: { contains: query, mode: "insensitive" } },
              { eventKey: { contains: query, mode: "insensitive" } },
              { targetUserId: query },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      targetUserId: true,
      eventKey: true,
      reason: true,
      details: true,
      createdAt: true,
      actor: { select: { memberProfile: { select: { displayName: true } } } },
      targetUser: { select: { id: true, memberProfile: { select: { displayName: true } } } },
    },
  });
  return (
    <main className="interaction-page admin-operations-page">
      <AdminPageHeader
        title="Security audit log"
        description="Append-only record of privileged actions. Sensitive detail payloads are not exported or shown; use the request ID to correlate an authorized incident review."
      />
      <AdminNavigation current="/admin/audit" />
      <section className="interaction-panel">
        <form className="admin-filter-form" action="/admin/audit">
          <label>
            Search event, reason, or target ID
            <input name="q" defaultValue={query} maxLength={100} />
          </label>
          <label>
            Event type
            <input name="event" defaultValue={eventKey} maxLength={80} />
          </label>
          <button className="secondary-button">Apply filters</button>
        </form>
        <p className="privacy-notice">Showing the newest 200 matching entries.</p>
        {events.length ? (
          <ul className="audit-list">
            {events.map((item) => {
              const details =
                item.details && typeof item.details === "object" && !Array.isArray(item.details)
                  ? (item.details as Record<string, unknown>)
                  : {};
              const requestId = typeof details.requestId === "string" ? details.requestId : null;
              return (
                <li key={item.id}>
                  <strong>{item.eventKey}</strong>
                  <span>{item.reason || "No reason recorded"}</span>
                  <small>
                    Actor: {item.actor?.memberProfile?.displayName || "System"} · Target:{" "}
                    {item.targetUser?.memberProfile?.displayName ||
                      (item.targetUserId ? "Member" : "None")}
                  </small>
                  {requestId && <code>Request {requestId}</code>}
                  <time dateTime={item.createdAt.toISOString()}>
                    {item.createdAt.toLocaleString()}
                  </time>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-state">No audit records match these filters.</p>
        )}
      </section>
    </main>
  );
}
