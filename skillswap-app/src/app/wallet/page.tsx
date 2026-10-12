import Link from "next/link";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import {
  creditPostingEnabled,
  ensureProfileCompletionReward,
  getMemberCreditTotals,
} from "@/lib/credit-ledger";
import type { CreditTransactionType } from "@/generated/prisma/client";
import { redeemCreditCode } from "./redeem-credit-code";

const transactionTypes: CreditTransactionType[] = [
  "PURCHASE",
  "SESSION_HOLD",
  "HOLD_RELEASE",
  "SESSION_SETTLEMENT",
  "REFUND",
  "GIFT",
  "PROMOTION",
  "REFERRAL",
  "PLATFORM_RETENTION",
  "ADMIN_ADJUSTMENT",
  "REVERSAL",
];

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; promo?: string }>;
}) {
  const member = await requireMemberPage();
  const params = await searchParams;
  const type = params.type;
  const filter = transactionTypes.includes(type as CreditTransactionType)
    ? (type as CreditTransactionType)
    : undefined;
  const prisma = getPrismaClient();
  await prisma.$transaction((tx) => ensureProfileCompletionReward(tx, member.id));
  const [totals, transactions, gifts, assignedVouchers] = await Promise.all([
    prisma.$transaction((tx) => getMemberCreditTotals(tx, member.id)),
    prisma.creditLedgerTransaction.findMany({
      where: {
        entries: { some: { account: { userId: member.id } } },
        ...(filter ? { type: filter } : {}),
      },
      include: {
        entries: {
          where: { account: { userId: member.id } },
          include: { account: { select: { type: true } } },
        },
        session: { select: { id: true, priceCredits: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.creditGift.findMany({
      where: { OR: [{ senderId: member.id }, { recipientId: member.id }] },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        sender: { select: { id: true, memberProfile: { select: { displayName: true } } } },
        recipient: { select: { id: true, memberProfile: { select: { displayName: true } } } },
      },
    }),
    prisma.creditCode.findMany({
      where: {
        recipientId: member.id,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        redemptions: { none: { userId: member.id } },
      },
      select: {
        id: true,
        amount: true,
        redemptionCount: true,
        maxRedemptions: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const vouchers = assignedVouchers.filter(
    (voucher) => voucher.redemptionCount < voucher.maxRedemptions,
  );
  const formatSource = (source: string) => source.toLowerCase().replaceAll("_", " ");
  return (
    <main className="interaction-page">
      <header className="interaction-header">
        <div>
          <p className="section-kicker">CREDIT WALLET</p>
          <h1>Your credits</h1>
          <p>Balances are calculated from the immutable ledger and open holds.</p>
        </div>
        <nav className="interaction-nav">
          <Link href="/wallet/gift">Send credits</Link>
          <Link href="/sessions">Sessions</Link>
          <Link href="/member">Workspace</Link>
        </nav>
      </header>
      {!creditPostingEnabled() && (
        <p className="privacy-notice">
          Credit holds and settlement are disabled by default. The Phase 1 policy is approved, but
          settlement must be explicitly enabled for an isolated verification environment or
          controlled beta. Purchases remain unavailable.
        </p>
      )}
      <section className="interaction-panel wallet-purchase-panel">
        <div>
          <h2>Credit purchases</h2>
          <p>
            Purchases are paused until the launch country, processor, supported currencies, pricing,
            tax, refunds, and chargeback rules are approved.
          </p>
        </div>
        <span className="privacy-notice">
          No processor is selected. No purchase or redirect can add credits to your balance.
        </span>
      </section>
      <section className="interaction-panel wallet-vouchers-panel">
        <div className="interaction-panel-heading">
          <div>
            <h2>Your redeemable vouchers</h2>
            <p>Vouchers assigned to your account are shown here. Redeem one to add its credits.</p>
          </div>
        </div>
        {vouchers.length ? (
          <div className="wallet-voucher-list">
            {vouchers.map((voucher) => (
              <article className="wallet-voucher-card" key={voucher.id}>
                <div>
                  <span className="capability-tag">SKILLSWAP VOUCHER</span>
                  <strong>{voucher.amount} Skill Credits</strong>
                  <small>
                    {voucher.expiresAt
                      ? `Redeem by ${voucher.expiresAt.toLocaleDateString()}`
                      : "No expiry date"}
                  </small>
                </div>
                <form action={redeemCreditCode}>
                  <input type="hidden" name="voucherId" value={voucher.id} />
                  <button className="primary-button">Redeem voucher</button>
                </form>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">
            No redeemable vouchers yet. An Admin can assign a voucher to your account.
          </p>
        )}
      </section>
      <section className="interaction-panel">
        <h2>Redeem a Skill Credit code</h2>
        <p>Enter a code from SkillSwap to add its credits to your wallet.</p>
        {params.promo === "redeemed" && (
          <p className="privacy-notice" role="status">
            Code redeemed. Your new credits are included in the balance and credit history below.
          </p>
        )}
        {params.promo === "unavailable" && (
          <p className="form-error" role="alert">
            That code is invalid, expired, fully redeemed, or already used by your account.
          </p>
        )}
        <form action={redeemCreditCode} className="interaction-form wallet-redeem-code-form">
          <label>
            Special code
            <input name="code" autoComplete="off" maxLength={30} placeholder="SKILL-…" required />
          </label>
          <button className="primary-button">Redeem code</button>
        </form>
      </section>
      <section className="wallet-balance-grid">
        <article className="wallet-balance-card">
          <span>Spendable</span>
          <strong>{totals.spendable}</strong>
          <small>credits available to use</small>
        </article>
        <article className="wallet-balance-card">
          <span>On hold</span>
          <strong>{totals.held}</strong>
          <small>reserved for active sessions</small>
        </article>
      </section>
      <section className="interaction-panel">
        <div className="interaction-panel-heading">
          <div>
            <h2>Credit gifts</h2>
            <p>Recent gifts sent and received.</p>
          </div>
          <Link className="secondary-button" href="/wallet/gift">
            Send a gift
          </Link>
        </div>
        {gifts.length ? (
          <div className="ledger-list">
            {gifts.map((gift) => {
              const sent = gift.senderId === member.id;
              const other = sent ? gift.recipient : gift.sender;
              return (
                <article className="ledger-row" key={gift.id}>
                  <div>
                    <strong>
                      {sent ? "You sent" : "Received from"}{" "}
                      {other.memberProfile?.displayName || "Member"}
                    </strong>
                    <p>{gift.message || "No message"}</p>
                    <small>{gift.createdAt.toLocaleString()}</small>
                  </div>
                  <div className={`ledger-amount ${sent ? "debit" : "credit"}`}>
                    {sent ? "−" : "+"}
                    {gift.amount}
                    <small>gift credits</small>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">No credit gifts yet.</p>
        )}
      </section>
      <section className="interaction-panel">
        <div className="interaction-panel-heading">
          <div>
            <h2>Credit history</h2>
            <p>Credits are non-withdrawable. Every movement remains in your ledger.</p>
          </div>
          <form method="get" className="wallet-filter">
            <label>
              Type
              <select name="type" defaultValue={filter || ""}>
                <option value="">All activity</option>
                {transactionTypes.map((item) => (
                  <option key={item} value={item}>
                    {formatSource(item)}
                  </option>
                ))}
              </select>
            </label>
            <button className="secondary-button">Filter</button>
          </form>
        </div>
        {transactions.length ? (
          <div className="ledger-list">
            {transactions.map((item) => {
              const userNet = item.entries.reduce((sum, entry) => sum + entry.amount, 0);
              const sources = [...new Set(item.entries.map((entry) => entry.source))]
                .map(formatSource)
                .join(", ");
              return (
                <article className="ledger-row" key={item.id}>
                  <div>
                    <strong>{formatSource(item.type)}</strong>
                    <p>
                      {item.reason || sources}
                      {item.session && (
                        <>
                          {" "}
                          · <Link href={`/sessions/${item.session.id}`}>Session</Link>
                        </>
                      )}
                    </p>
                    <small>{item.createdAt.toLocaleString()}</small>
                  </div>
                  <div
                    className={
                      userNet < 0
                        ? "ledger-amount debit"
                        : userNet > 0
                          ? "ledger-amount credit"
                          : "ledger-amount"
                    }
                  >
                    {userNet > 0 ? "+" : ""}
                    {userNet}
                    <small>{sources}</small>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">
            No credit activity yet. Your ledger will show each credit movement here.
          </p>
        )}
      </section>
    </main>
  );
}
