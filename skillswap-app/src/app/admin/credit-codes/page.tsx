import { getPrismaClient } from "@/lib/db/prisma";
import { AdminNavigation, AdminPageHeader, requireAdminPage } from "../admin-shared";
import { deactivateAdminCreditCode } from "../credit-code-actions";
import { CreditCodeForm } from "../credit-code-form";

export default async function AdminCreditCodesPage() {
  await requireAdminPage();
  const prisma = getPrismaClient();
  const [creditCodes, recipients] = await Promise.all([
    prisma.creditCode.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        createdBy: { select: { memberProfile: { select: { displayName: true } } } },
        recipient: {
          select: {
            id: true,
            memberProfile: { select: { displayName: true } },
            authUser: { select: { email: true } },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { status: "ACTIVE", adminGrant: null, memberProfile: { isNot: null } },
      select: {
        id: true,
        memberProfile: { select: { displayName: true } },
        authUser: { select: { email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
  ]);
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
          Voucher awards and redemption work independently of session settlement. Credit purchases
          and session holds remain paused until the launch policy is enabled.
        </p>
        <CreditCodeForm
          members={recipients.map((recipient) => ({
            id: recipient.id,
            displayName: recipient.memberProfile?.displayName || "Member",
            email: recipient.authUser?.email || "No email",
          }))}
        />
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
                      {code.amount} credits each · {code.redemptionCount}/{code.maxRedemptions}{" "}
                      redemptions
                    </span>
                    <span>Created by {code.createdBy.memberProfile?.displayName || "Admin"}</span>
                    <span>
                      {code.recipient
                        ? `Voucher for ${code.recipient.memberProfile?.displayName || code.recipient.authUser?.email || "Member"}`
                        : "Shared code"}
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
