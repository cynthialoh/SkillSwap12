import Link from "next/link";
import { getPrismaClient } from "@/lib/db/prisma";
import { AdminNavigation, AdminPageHeader, requireAdminPage } from "../admin-shared";

type Search = Promise<{ q?: string; status?: string }>;

const statuses = [
  "PROPOSED",
  "CONFIRMED",
  "COMPLETED",
  "DISPUTED",
  "CANCELLED",
  "NO_SHOW",
] as const;

export default async function AdminSessionsPage({ searchParams }: { searchParams: Search }) {
  await requireAdminPage();
  const { q = "", status = "ALL" } = await searchParams;
  const query = q.trim().slice(0, 100);
  const selectedStatus = statuses.includes(status as (typeof statuses)[number])
    ? (status as (typeof statuses)[number])
    : "ALL";
  const sessions = await getPrismaClient().session.findMany({
    where: {
      ...(selectedStatus !== "ALL" ? { status: selectedStatus } : {}),
      ...(query
        ? {
            OR: [
              { id: query },
              { exchangeRequest: { is: { title: { contains: query, mode: "insensitive" } } } },
              {
                learner: {
                  is: {
                    memberProfile: {
                      is: { displayName: { contains: query, mode: "insensitive" } },
                    },
                  },
                },
              },
              {
                teacher: {
                  is: {
                    memberProfile: {
                      is: { displayName: { contains: query, mode: "insensitive" } },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      status: true,
      startsAt: true,
      endsAt: true,
      createdAt: true,
      exchangeRequest: { select: { title: true, type: true } },
      learner: { select: { id: true, memberProfile: { select: { displayName: true } } } },
      teacher: { select: { id: true, memberProfile: { select: { displayName: true } } } },
      creditHold: { select: { amount: true, status: true } },
      dispute: { select: { id: true, status: true } },
    },
  });
  return (
    <main className="interaction-page admin-operations-page">
      <AdminPageHeader
        title="Session operations"
        description="Search session records and see their operational state. Meeting links, private messages, and dispute narratives are excluded from this view."
      />
      <AdminNavigation current="/admin/sessions" />
      <section className="interaction-panel">
        <form className="admin-filter-form" action="/admin/sessions">
          <label>
            Search title, participant, or session ID
            <input name="q" defaultValue={query} maxLength={100} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={selectedStatus}>
              <option value="ALL">All statuses</option>
              {statuses.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button">Apply filters</button>
        </form>
        {sessions.length ? (
          <ul className="audit-list">
            {sessions.map((session) => (
              <li key={session.id}>
                <strong>
                  {session.exchangeRequest.title} · {session.status.replaceAll("_", " ")}
                </strong>
                <span>
                  {session.learner.memberProfile?.displayName || "Member"} ↔{" "}
                  {session.teacher.memberProfile?.displayName || "Member"} ·{" "}
                  {session.exchangeRequest.type.replaceAll("_", " ")}
                </span>
                <small>
                  {session.startsAt ? session.startsAt.toLocaleString() : "Not scheduled"}
                  {session.endsAt ? ` – ${session.endsAt.toLocaleTimeString()}` : ""} · Created{" "}
                  {session.createdAt.toLocaleDateString()}
                </small>
                {session.creditHold && (
                  <small>
                    {session.creditHold.amount} credits · {session.creditHold.status.toLowerCase()}{" "}
                    hold
                  </small>
                )}
                {session.dispute && <small>Dispute: {session.dispute.status.toLowerCase()}</small>}
                <Link href={`/sessions/${session.id}`}>Open session</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No sessions match these filters.</p>
        )}
      </section>
    </main>
  );
}
