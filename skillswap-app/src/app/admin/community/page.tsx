import Link from "next/link";
import { getPrismaClient } from "@/lib/db/prisma";
import { AdminNavigation, AdminPageHeader, requireAdminPage } from "../admin-shared";
import { dismissCommunityReport, hideReportedCommunityPost } from "../community-actions";

export default async function AdminCommunityPage() {
  await requireAdminPage();
  const reports = await getPrismaClient().communityContentReport.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      post: {
        select: {
          id: true,
          title: true,
          body: true,
          status: true,
          author: { select: { memberProfile: { select: { displayName: true } } } },
        },
      },
      reporter: { select: { memberProfile: { select: { displayName: true } } } },
    },
  });
  return (
    <main className="admin-page">
      <AdminNavigation current="/admin/community" />
      <AdminPageHeader
        title="Community moderation"
        description="Review member reports about learning posts. Decisions are recorded in the append-only audit log."
      />
      <section className="admin-panel">
        {reports.length ? (
          reports.map((report) => (
            <article className="admin-queue-item" key={report.id}>
              <div>
                <p className="section-kicker">
                  {report.category} · {report.createdAt.toLocaleString()}
                </p>
                <h2>{report.post.title}</h2>
                <p>{report.post.body}</p>
                <p>
                  Author: {report.post.author.memberProfile?.displayName || "Member"} · Reported by:{" "}
                  {report.reporter.memberProfile?.displayName || "Member"}
                </p>
                <p>Report context: {report.details}</p>
                <Link href={`/community#${report.post.id}`}>View post in community</Link>
              </div>
              <div className="admin-action-group">
                <form action={hideReportedCommunityPost}>
                  <input type="hidden" name="reportId" value={report.id} />
                  <button className="primary-button">Hide post and resolve</button>
                </form>
                <form action={dismissCommunityReport}>
                  <input type="hidden" name="reportId" value={report.id} />
                  <button className="secondary-button">Dismiss report</button>
                </form>
              </div>
            </article>
          ))
        ) : (
          <p className="empty-state">No open community content reports.</p>
        )}
      </section>
    </main>
  );
}
