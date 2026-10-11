import { getPrismaClient } from "@/lib/db/prisma";
import { AdminNavigation, AdminPageHeader, requireAdminPage } from "../admin-shared";

function rate(numerator: number, denominator: number) {
  return denominator ? `${Math.round((numerator / denominator) * 100)}%` : "—";
}

function thirtyDaysAgo() {
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <article className="admin-metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export default async function AdminMetricsPage() {
  await requireAdminPage();
  const prisma = getPrismaClient();
  const since = thirtyDaysAgo();

  const [
    memberCount,
    newMembers,
    activatedMembers,
    activeListings,
    newListings,
    categoryRows,
    requestCount,
    learningRequestCount,
    newRequests,
    acceptedExchanges,
    acceptedLearningResponses,
    sessionCount,
    confirmedSessions,
    completedSessions,
    noShowSessions,
    disputedSessions,
    repeatParticipants,
    directSwapCount,
    settledDirectSwaps,
    openSafetyReports,
    resolvedSafetyReports,
    trustChanges,
    ledgerTransactions,
    unbalancedTransactions,
    purchaseTransactions,
  ] = await Promise.all([
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "ACTIVE", createdAt: { gte: since } } }),
    prisma.memberProfile.count({ where: { onboardingCompletedAt: { gte: since } } }),
    prisma.skillListing.count({ where: { isActive: true } }),
    prisma.skillListing.count({ where: { isActive: true, createdAt: { gte: since } } }),
    prisma.skillListing.groupBy({
      by: ["categoryId", "direction"],
      where: { isActive: true },
      _count: { _all: true },
    }),
    prisma.exchangeRequest.count(),
    prisma.learningRequest.count(),
    prisma.exchangeRequest.count({ where: { createdAt: { gte: since } } }),
    prisma.exchangeRequest.count({ where: { status: "ACCEPTED" } }),
    prisma.learningRequestResponse.count({ where: { status: "ACCEPTED" } }),
    prisma.session.count(),
    prisma.session.count({ where: { status: "CONFIRMED" } }),
    prisma.session.count({ where: { status: "COMPLETED" } }),
    prisma.session.count({ where: { status: { in: ["NO_SHOW", "NO_SHOW_REPORTED"] } } }),
    prisma.session.count({ where: { status: "DISPUTED" } }),
    prisma.session.findMany({
      where: { status: "COMPLETED" },
      select: { learnerId: true, teacherId: true },
    }),
    prisma.directSwap.count(),
    prisma.directSwap.count({ where: { status: "SETTLED" } }),
    prisma.safetyReport.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    prisma.safetyReport.count({
      where: { status: { in: ["RESOLVED", "DISMISSED"] }, updatedAt: { gte: since } },
    }),
    prisma.trustLevelEvent.count({ where: { createdAt: { gte: since } } }),
    prisma.creditLedgerTransaction.count(),
    prisma.creditLedgerEntry.groupBy({
      by: ["transactionId"],
      _sum: { amount: true },
    }),
    prisma.creditLedgerTransaction.count({ where: { type: "PURCHASE" } }),
  ]);

  const participantCompletions = new Map<string, number>();
  for (const session of repeatParticipants) {
    participantCompletions.set(
      session.learnerId,
      (participantCompletions.get(session.learnerId) ?? 0) + 1,
    );
    participantCompletions.set(
      session.teacherId,
      (participantCompletions.get(session.teacherId) ?? 0) + 1,
    );
  }
  const repeatMemberCount = [...participantCompletions.values()].filter(
    (count) => count > 1,
  ).length;
  const categoryIds = [...new Set(categoryRows.map((row) => row.categoryId))];
  const categories = await prisma.skillCategory.findMany({
    where: { id: { in: categoryIds } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const categoryMetrics = categories.map((category) => ({
    name: category.name,
    teaching:
      categoryRows.find((row) => row.categoryId === category.id && row.direction === "TEACH")
        ?._count._all ?? 0,
    learning:
      categoryRows.find((row) => row.categoryId === category.id && row.direction === "LEARN")
        ?._count._all ?? 0,
  }));
  const totalExchangeRequests = requestCount + learningRequestCount;
  const acceptedRequests = acceptedExchanges + acceptedLearningResponses;
  const unbalancedCount = unbalancedTransactions.filter(
    (transaction) => (transaction._sum.amount ?? 0) !== 0,
  ).length;
  const noShowRate = rate(noShowSessions, sessionCount);
  const disputeRate = rate(disputedSessions, sessionCount);

  return (
    <main className="interaction-page admin-operations-page">
      <AdminPageHeader
        title="Marketplace metrics"
        description="Aggregate product outcomes for the last 30 days and lifetime. These metrics contain no member names, contact details, or message content."
      />
      <AdminNavigation current="/admin/metrics" />

      <section className="interaction-panel">
        <h2>Activation and supply · last 30 days</h2>
        <div className="admin-metric-grid">
          <Metric
            label="Active members"
            value={memberCount}
            detail={`${newMembers} joined in the last 30 days`}
          />
          <Metric
            label="Onboarding completed"
            value={activatedMembers}
            detail="Member profiles completed in the last 30 days"
          />
          <Metric
            label="Active skill listings"
            value={activeListings}
            detail={`${newListings} added in the last 30 days`}
          />
          <Metric
            label="Requests created"
            value={newRequests}
            detail="Exchange requests created in the last 30 days"
          />
        </div>
      </section>

      <section className="interaction-panel">
        <h2>Request and session outcomes · lifetime</h2>
        <div className="admin-metric-grid">
          <Metric
            label="Request acceptance"
            value={rate(acceptedRequests, totalExchangeRequests)}
            detail={`${acceptedRequests} accepted of ${totalExchangeRequests} exchange and learning requests`}
          />
          <Metric
            label="Sessions completed"
            value={rate(completedSessions, sessionCount)}
            detail={`${completedSessions} completed of ${sessionCount} total sessions`}
          />
          <Metric
            label="Confirmed sessions"
            value={confirmedSessions}
            detail="Currently confirmed"
          />
          <Metric
            label="Repeat learners and teachers"
            value={repeatMemberCount}
            detail="Members with more than one completed session"
          />
          <Metric
            label="No-show rate"
            value={noShowRate}
            detail={`${noShowSessions} no-show or reported no-show sessions`}
          />
          <Metric
            label="Dispute rate"
            value={disputeRate}
            detail={`${disputedSessions} disputed sessions`}
          />
        </div>
      </section>

      <section className="interaction-panel">
        <h2>Supply and demand by category</h2>
        {categoryMetrics.length ? (
          <div className="admin-metric-table-wrap">
            <table className="admin-metric-table">
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Teaching skills</th>
                  <th scope="col">Learning skills</th>
                  <th scope="col">Supply gap</th>
                </tr>
              </thead>
              <tbody>
                {categoryMetrics.map((category) => (
                  <tr key={category.name}>
                    <th scope="row">{category.name}</th>
                    <td>{category.teaching}</td>
                    <td>{category.learning}</td>
                    <td>
                      {category.learning - category.teaching > 0
                        ? `${category.learning - category.teaching} more learning listings`
                        : category.teaching - category.learning > 0
                          ? `${category.teaching - category.learning} more teaching listings`
                          : "Balanced"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">No active skill listings yet.</p>
        )}
      </section>

      <section className="interaction-panel">
        <h2>Trust, safety, and credits</h2>
        <div className="admin-metric-grid">
          <Metric
            label="Open safety reports"
            value={openSafetyReports}
            detail="Currently open or in review"
          />
          <Metric
            label="Safety reports resolved"
            value={resolvedSafetyReports}
            detail="Resolved or dismissed in the last 30 days"
          />
          <Metric
            label="Trust changes"
            value={trustChanges}
            detail="Trust level changes in the last 30 days"
          />
          <Metric
            label="Direct swaps settled"
            value={rate(settledDirectSwaps, directSwapCount)}
            detail={`${settledDirectSwaps} settled of ${directSwapCount} direct swaps`}
          />
          <Metric
            label="Ledger transactions"
            value={ledgerTransactions}
            detail="All transaction types; no money totals shown"
          />
          <Metric
            label="Unbalanced ledger transactions"
            value={unbalancedCount}
            detail="Transactions whose entries do not net to zero"
          />
          <Metric
            label="Purchase records"
            value={purchaseTransactions}
            detail="Credit ledger records only; not payment-provider revenue"
          />
        </div>
      </section>

      <p className="privacy-notice">
        Search-to-request conversion is not measured because the app does not persist search
        impressions. No behavioral tracking or search terms are collected. Payment purchases remain
        gated; ledger reconciliation is only a database consistency check. Confirm backup restore,
        accessibility, security, host recovery, and real payment/refund behavior using the launch
        checklist before a public beta.
      </p>
      <p className="privacy-notice">
        Supply and demand counts are active listings by teaching or learning direction across{" "}
        {categories.length} categories.
      </p>
    </main>
  );
}
