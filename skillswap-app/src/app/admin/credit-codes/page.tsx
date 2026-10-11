import { getPrismaClient } from "@/lib/db/prisma";
import { AdminNavigation, AdminPageHeader, requireAdminPage } from "../admin-shared";
import { deactivateAdminCreditCode } from "../credit-code-actions";
import { CreditCodeForm } from "../credit-code-form";

export default async function AdminCreditCodesPage() {
  await requireAdminPage();
  const creditCodes = await getPrismaClient().creditCode.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { createdBy: { select: { memberProfile: { select: { displayName: true } } } } },
  });
  const now = new Date();
  return (
    <main className="interaction-page admin-operations-page">
      <AdminPageHeader
        title="Skill Credit codes"
        description="Create one-time or shared redemption codes for members. Codes are stored as hashes and the full code is shown only when you create it."
      />
      <AdminNavigation current="/admin/credit-codes" />
      <section className="interaction-panel">
        <h2>Create a code</h2>
        <p>
          Set the credit award and total number of redemptions. Each member can redeem a code only
          once. Expiring or deactivating a code stops future redemptions; credits already awarded
          remain in the ledger.
        </p>
        <p className="privacy-notice">
          Code redemption follows the controlled-beta credit posting flag. Codes created while it is
          paused will become redeemable once credit posting is enabled, unless they expire or are
          deactivated first.
        </p>
        <CreditCodeForm />
      </section>
      <section className="interaction-panel">
        <h2>Issued codes</h2>
        {creditCodes.length ? (
          <ul className="audit-list admin-credit-code-list">
            {creditCodes.map((code) => {
              const status = !code.isActive
                ? "Deactivated"
                : code.expiresAt && code.expiresAt <= now
                  ? "Expired"
                  : code.redemptionCount >= code.maxRedemptions
                    ? "Fully redeemed"
                    : "Active";
              return (
                <li key={code.id}>
                  <div className="admin-credit-code-summary">
                    <strong>
                      {code.codePrefix} · {status}
                    </strong>
                    <span>
                      {code.amount} credits each · {code.redemptionCount}/{code.maxRedemptions} redemptions
                    </span>
                    <span>
                      Created by {code.createdBy.memberProfile?.displayName || "Admin"}
                    </span>
                    <span>Reason: {code.reason}</span>
                    <time dateTime={code.createdAt.toISOString()}>
                      Created {code.createdAt.toLocaleString()}
                    </time>
                    {code.expiresAt && (
                      <time dateTime={code.expiresAt.toISOString()}>
                        Expires {code.expiresAt.toLocaleString()}
                      </time>
                    )}
                  </div>
                  {code.isActive && code.redemptionCount < code.maxRedemptions && (
                    <form action={deactivateAdminCreditCode} className="interaction-form">
                      <input type="hidden" name="codeId" value={code.id} />
                      <label>
                        Reason to deactivate
                        <textarea name="reason" minLength={20} maxLength={500} rows={2} required />
                      </label>
                      <button className="secondary-button">Deactivate code</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-state">No credit codes have been created yet.</p>
        )}
      </section>
    </main>
  );
}
