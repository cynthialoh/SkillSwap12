import { getPrismaClient } from "@/lib/db/prisma";
import { AdminNavigation, AdminPageHeader, requireAdminPage } from "../admin-shared";
import { assignAdminQueueItem } from "../operations-actions";

const types = [
  "ALL",
  "SAFETY_REPORT",
  "SESSION_INCIDENT",
  "DISPUTE",
  "VERIFICATION",
  "DIRECT_SWAP",
] as const;
type QueueType = Exclude<(typeof types)[number], "ALL">;
type QueueItem = {
  id: string;
  type: QueueType;
  title: string;
  summary: string;
  createdAt: Date;
  conflicts: string[];
};
type Search = Promise<{ q?: string; type?: string; priority?: string; assignee?: string }>;

export default async function AdminQueuesPage({ searchParams }: { searchParams: Search }) {
  await requireAdminPage();
  const { q = "", type = "ALL", priority = "ALL", assignee = "ALL" } = await searchParams;
  const query = q.trim().slice(0, 100);
  const selectedType = types.includes(type as (typeof types)[number]) ? type : "ALL";
  const selectedPriority = ["ALL", "LOW", "NORMAL", "HIGH", "URGENT"].includes(priority)
    ? priority
    : "ALL";
  const prisma = getPrismaClient();
  const should = (item: QueueType) => selectedType === "ALL" || selectedType === item;
  const [reports, incidents, disputes, verifications, swaps, admins] = await Promise.all([
    should("SAFETY_REPORT")
      ? prisma.safetyReport.findMany({
          where: {
            status: { in: ["OPEN", "IN_REVIEW"] },
            ...(query
              ? {
                  OR: [
                    { details: { contains: query, mode: "insensitive" } },
                    { category: { equals: query.toUpperCase() as never } },
                  ],
                }
              : {}),
          },
          orderBy: { createdAt: "asc" },
          take: 100,
          select: {
            id: true,
            category: true,
            details: true,
            createdAt: true,
            reporterId: true,
            reportedUserId: true,
          },
        })
      : [],
    should("SESSION_INCIDENT")
      ? prisma.sessionIncident.findMany({
          where: {
            status: { in: ["OPEN", "IN_REVIEW"] },
            ...(query
              ? {
                  OR: [
                    { details: { contains: query, mode: "insensitive" } },
                    { type: { equals: query.toUpperCase() as never } },
                  ],
                }
              : {}),
          },
          orderBy: { createdAt: "asc" },
          take: 100,
          select: {
            id: true,
            type: true,
            details: true,
            createdAt: true,
            reporterId: true,
            reportedUserId: true,
          },
        })
      : [],
    should("DISPUTE")
      ? prisma.sessionDispute.findMany({
          where: {
            status: { in: ["OPEN", "IN_REVIEW", "APPEALED"] },
            ...(query
              ? {
                  OR: [
                    { details: { contains: query, mode: "insensitive" } },
                    {
                      session: {
                        exchangeRequest: {
                          is: { title: { contains: query, mode: "insensitive" } },
                        },
                      },
                    },
                  ],
                }
              : {}),
          },
          orderBy: { createdAt: "asc" },
          take: 100,
          select: {
            id: true,
            details: true,
            status: true,
            createdAt: true,
            openedById: true,
            otherUserId: true,
            session: { select: { exchangeRequest: { select: { title: true } } } },
          },
        })
      : [],
    should("VERIFICATION")
      ? prisma.verificationRequest.findMany({
          where: {
            status: { in: ["PENDING", "IN_REVIEW"] },
            ...(query
              ? {
                  OR: [
                    { statement: { contains: query, mode: "insensitive" } },
                    {
                      user: {
                        memberProfile: {
                          is: { displayName: { contains: query, mode: "insensitive" } },
                        },
                      },
                    },
                  ],
                }
              : {}),
          },
          orderBy: { submittedAt: "asc" },
          take: 100,
          select: {
            id: true,
            kind: true,
            statement: true,
            submittedAt: true,
            userId: true,
            reviewedById: true,
          },
        })
      : [],
    should("DIRECT_SWAP")
      ? prisma.directSwap.findMany({
          where: {
            status: { in: ["MUTUAL_CANCELLATION_PENDING", "RESOLUTION_PENDING"] },
            ...(query
              ? { exchangeRequest: { is: { title: { contains: query, mode: "insensitive" } } } }
              : {}),
          },
          orderBy: { updatedAt: "asc" },
          take: 100,
          select: {
            id: true,
            status: true,
            updatedAt: true,
            requesterId: true,
            recipientId: true,
            exchangeRequest: { select: { title: true } },
          },
        })
      : [],
    prisma.adminGrant.findMany({
      where: { user: { status: "ACTIVE" } },
      select: {
        userId: true,
        user: { select: { memberProfile: { select: { displayName: true } } } },
      },
      orderBy: { grantedAt: "asc" },
    }),
  ]);
  const items: QueueItem[] = [
    ...reports.map((item) => ({
      id: item.id,
      type: "SAFETY_REPORT" as const,
      title: `Safety report · ${item.category.toLowerCase().replaceAll("_", " ")}`,
      summary: item.details,
      createdAt: item.createdAt,
      conflicts: [item.reporterId, item.reportedUserId],
    })),
    ...incidents.map((item) => ({
      id: item.id,
      type: "SESSION_INCIDENT" as const,
      title: `Session incident · ${item.type.toLowerCase().replaceAll("_", " ")}`,
      summary: item.details,
      createdAt: item.createdAt,
      conflicts: [item.reporterId, item.reportedUserId],
    })),
    ...disputes.map((item) => ({
      id: item.id,
      type: "DISPUTE" as const,
      title: `${item.session.exchangeRequest.title} · ${item.status.toLowerCase().replaceAll("_", " ")}`,
      summary: item.details,
      createdAt: item.createdAt,
      conflicts: [item.openedById, item.otherUserId],
    })),
    ...verifications.map((item) => ({
      id: item.id,
      type: "VERIFICATION" as const,
      title: `${item.kind.toLowerCase()} verification`,
      summary: item.statement,
      createdAt: item.submittedAt,
      conflicts: [item.userId, ...(item.reviewedById ? [item.reviewedById] : [])],
    })),
    ...swaps.map((item) => ({
      id: item.id,
      type: "DIRECT_SWAP" as const,
      title: `${item.exchangeRequest.title} · ${item.status.toLowerCase().replaceAll("_", " ")}`,
      summary:
        "Direct-swap review requires an Admin outcome or both members’ cancellation confirmation.",
      createdAt: item.updatedAt,
      conflicts: [item.requesterId, item.recipientId],
    })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const assignments = items.length
    ? await prisma.adminQueueAssignment.findMany({
        where: { OR: items.map((item) => ({ itemType: item.type, itemId: item.id })) },
        include: {
          assignee: { select: { id: true, memberProfile: { select: { displayName: true } } } },
        },
      })
    : [];
  const assignmentMap = new Map(
    assignments.map((item) => [`${item.itemType}:${item.itemId}`, item]),
  );
  const priorityRank: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
  const filteredItems = items
    .filter((item) => {
      const assignment = assignmentMap.get(`${item.type}:${item.id}`);
      return (
        (selectedPriority === "ALL" || assignment?.priority === selectedPriority) &&
        (assignee === "ALL" ||
          (assignee === "UNASSIGNED"
            ? !assignment?.assigneeId
            : assignment?.assigneeId === assignee))
      );
    })
    .sort((a, b) => {
      const rankA = priorityRank[assignmentMap.get(`${a.type}:${a.id}`)?.priority ?? "NORMAL"];
      const rankB = priorityRank[assignmentMap.get(`${b.type}:${b.id}`)?.priority ?? "NORMAL"];
      return rankA - rankB || a.createdAt.getTime() - b.createdAt.getTime();
    });
  return (
    <main className="interaction-page admin-operations-page">
      <AdminPageHeader
        title="Operational queues"
        description="Higher priority items appear first; work within each priority is sorted oldest first. Assignments and reviewer conflict checks are recorded in the audit log."
      />
      <AdminNavigation current="/admin/queues" />
      <section className="interaction-panel">
        <form className="admin-filter-form" action="/admin/queues">
          <label>
            Search queue details or title
            <input name="q" defaultValue={query} maxLength={100} />
          </label>
          <label>
            Queue
            <select name="type" defaultValue={selectedType}>
              {types.map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Priority
            <select name="priority" defaultValue={selectedPriority}>
              {["ALL", "LOW", "NORMAL", "HIGH", "URGENT"].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assignment
            <select name="assignee" defaultValue={assignee}>
              <option value="ALL">All</option>
              <option value="UNASSIGNED">Unassigned</option>
              {admins.map((admin) => (
                <option key={admin.userId} value={admin.userId}>
                  {admin.user.memberProfile?.displayName || "Admin"}
                </option>
              ))}
            </select>
          </label>
          <button className="secondary-button">Apply filters</button>
        </form>
        <p className="privacy-notice">
          Showing up to 100 oldest records per queue before filters. Case details are private to
          authorized Admins; do not export or copy them into external tools.
        </p>
        {filteredItems.length ? (
          <ul className="audit-list">
            {filteredItems.map((item) => {
              const assignment = assignmentMap.get(`${item.type}:${item.id}`);
              const currentAssignee = assignment?.assigneeId;
              const conflictedAssignment = Boolean(
                currentAssignee && item.conflicts.includes(currentAssignee),
              );
              return (
                <li key={`${item.type}:${item.id}`}>
                  <strong>{item.title}</strong>
                  <span>{item.summary}</span>
                  <small>
                    {item.type.replaceAll("_", " ")} · created {item.createdAt.toLocaleString()} ·{" "}
                    {assignment?.priority ?? "NORMAL"} priority ·{" "}
                    {assignment?.assignee?.memberProfile?.displayName ||
                      (currentAssignee ? "Former Admin" : "Unassigned")}
                  </small>
                  {conflictedAssignment && (
                    <p className="privacy-notice">
                      The current assignee is involved in this case. Reassign it to a conflict-free
                      Admin.
                    </p>
                  )}
                  <form
                    action={assignAdminQueueItem}
                    className="interaction-form admin-queue-assignment"
                  >
                    <input type="hidden" name="itemType" value={item.type} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <label>
                      Priority
                      <select name="priority" defaultValue={assignment?.priority ?? "NORMAL"}>
                        {["LOW", "NORMAL", "HIGH", "URGENT"].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Assign to
                      <select
                        name="assigneeId"
                        defaultValue={conflictedAssignment ? "" : (currentAssignee ?? "")}
                      >
                        <option value="">Unassigned</option>
                        {admins
                          .filter((admin) => !item.conflicts.includes(admin.userId))
                          .map((admin) => (
                            <option key={admin.userId} value={admin.userId}>
                              {admin.user.memberProfile?.displayName || "Admin"}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Assignment reason
                      <textarea name="reason" minLength={15} maxLength={500} rows={2} required />
                    </label>
                    <button className="secondary-button">Save assignment</button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-state">No queue items match these filters.</p>
        )}
      </section>
    </main>
  );
}
