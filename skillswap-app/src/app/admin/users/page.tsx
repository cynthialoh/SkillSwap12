import Link from "next/link";
import { getPrismaClient } from "@/lib/db/prisma";
import { AdminNavigation, AdminPageHeader, requireAdminPage } from "../admin-shared";
import { revokeAdminGrant, setUserAccountStatus } from "../operations-actions";

type Search = Promise<{ q?: string; status?: string }>;

function redactEmail(email: string | null | undefined) {
  if (!email) return "Email unavailable";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}•••@${domain}`;
}

export default async function AdminUsersPage({ searchParams }: { searchParams: Search }) {
  await requireAdminPage();
  const { q = "", status = "ALL" } = await searchParams;
  const query = q.trim().slice(0, 100);
  const prisma = getPrismaClient();
  const users = await prisma.user.findMany({
    where: {
      ...(status !== "ALL" &&
      ["ACTIVE", "RESTRICTED", "SUSPENDED", "DELETION_PENDING"].includes(status)
        ? { status: status as "ACTIVE" | "RESTRICTED" | "SUSPENDED" | "DELETION_PENDING" }
        : {}),
      ...(query
        ? {
            OR: [
              { memberProfile: { is: { displayName: { contains: query, mode: "insensitive" } } } },
              { authUser: { is: { email: { contains: query, mode: "insensitive" } } } },
              { id: query },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      status: true,
      createdAt: true,
      authUser: { select: { email: true, emailVerified: true } },
      adminGrant: { select: { grantedAt: true, reason: true } },
      memberProfile: { select: { displayName: true, verifiedAt: true, trustLevel: true } },
      _count: {
        select: { reportsAboutMe: true, sessionsAsLearner: true, sessionsAsTeacher: true },
      },
    },
  });
  return (
    <main className="interaction-page admin-operations-page">
      <AdminPageHeader
        title="Member operations"
        description="Search accounts and review status. Email addresses are masked in this list; all account changes require a reason and are audited."
      />
      <AdminNavigation current="/admin/users" />
      <section className="interaction-panel">
        <form className="admin-filter-form" action="/admin/users">
          <label>
            Search name, email, or account ID
            <input name="q" defaultValue={query} maxLength={100} />
          </label>
          <label>
            Status
            <select name="status" defaultValue={status}>
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="RESTRICTED">Restricted</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="DELETION_PENDING">Deletion pending</option>
            </select>
          </label>
          <button className="secondary-button">Apply filters</button>
        </form>
        <p className="privacy-notice">
          Showing up to 100 newest accounts. Use a specific search to narrow the list.
        </p>
        {users.length ? (
          <ul className="audit-list">
            {users.map((user) => (
              <li key={user.id}>
                <strong>
                  {user.memberProfile?.displayName || "Unfinished profile"} ·{" "}
                  {user.status.replaceAll("_", " ")}
                  {user.adminGrant ? " · Admin" : ""}
                </strong>
                <span>
                  {redactEmail(user.authUser?.email)} ·{" "}
                  {user.authUser?.emailVerified ? "verified email" : "email not verified"} · Trust
                  Level {user.memberProfile?.trustLevel ?? "—"} ·{" "}
                  {user._count.sessionsAsLearner + user._count.sessionsAsTeacher} session records ·{" "}
                  {user._count.reportsAboutMe} reports
                </span>
                <small>
                  Account {user.id} · joined {user.createdAt.toLocaleString()}
                  {user.memberProfile?.verifiedAt ? " · identity verified" : ""}
                </small>
                {user.adminGrant ? (
                  <form action={revokeAdminGrant} className="interaction-form">
                    <input type="hidden" name="userId" value={user.id} />
                    <label>
                      Offboarding reason
                      <textarea name="reason" minLength={20} maxLength={500} rows={2} required />
                    </label>
                    <button className="secondary-button">Revoke Admin grant</button>
                  </form>
                ) : (
                  user.status !== "DELETION_PENDING" && (
                    <form action={setUserAccountStatus} className="interaction-form">
                      <input type="hidden" name="userId" value={user.id} />
                      <label>
                        Account status
                        <select
                          name="status"
                          defaultValue={user.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
                        >
                          <option value="ACTIVE">Restore access</option>
                          <option value="RESTRICTED">Restrict access</option>
                          <option value="SUSPENDED">Suspend access</option>
                        </select>
                      </label>
                      <label>
                        Reason
                        <textarea name="reason" minLength={20} maxLength={500} rows={2} required />
                      </label>
                      <button className="secondary-button">Save account status</button>
                    </form>
                  )
                )}
                <Link href={`/profiles/${user.id}`}>View public profile</Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No accounts match these filters.</p>
        )}
      </section>
    </main>
  );
}
