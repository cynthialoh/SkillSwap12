import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireMemberPage } from "@/lib/dal";
import { getPrismaClient } from "@/lib/db/prisma";
import { creditPostingEnabled, getMemberCreditTotals } from "@/lib/credit-ledger";
import { sendCreditGift } from "../gift-actions";

type Search = Promise<{ q?: string; to?: string; sent?: string }>;

export default async function GiftCreditsPage({ searchParams }: { searchParams: Search }) {
  const member = await requireMemberPage();
  const { q = "", to = "", sent = "" } = await searchParams;
  const query = q.trim().slice(0, 80);
  const prisma = getPrismaClient();
  const [totals, recipients] = await Promise.all([
    prisma.$transaction((tx) => getMemberCreditTotals(tx, member.id)),
    to && to !== member.id
      ? prisma.user.findMany({
          where: {
            id: to,
            status: "ACTIVE",
            adminGrant: null,
            memberProfile: { is: { isDiscoverable: true, onboardingCompletedAt: { not: null } } },
            NOT: [
              { blocksCreated: { some: { blockedUserId: member.id } } },
              { blocksReceived: { some: { blockerId: member.id } } },
            ],
          },
          take: 1,
          select: { id: true, memberProfile: { select: { displayName: true, teachSkills: true } } },
        })
      : !to && query.length >= 2
        ? prisma.user.findMany({
            where: {
              id: { not: member.id },
              status: "ACTIVE",
              adminGrant: null,
              memberProfile: {
                is: {
                  isDiscoverable: true,
                  onboardingCompletedAt: { not: null },
                  displayName: { contains: query, mode: "insensitive" },
                },
              },
              NOT: [
                { blocksCreated: { some: { blockedUserId: member.id } } },
                { blocksReceived: { some: { blockerId: member.id } } },
              ],
            },
            orderBy: { memberProfile: { displayName: "asc" } },
            take: 20,
            select: {
              id: true,
              memberProfile: { select: { displayName: true, teachSkills: true } },
            },
          })
        : [],
  ]);
  const enabled = creditPostingEnabled();
  return (
    <main className="interaction-page">
      <Link href="/wallet" className="text-link">
        ← Credit wallet
      </Link>
      <section className="interaction-panel form-panel">
        <p className="section-kicker">MEMBER-TO-MEMBER GIFT</p>
        <h1>Send Skill Credits</h1>
        <p>
          Give credits to another active Member. The gift is an internal ledger transfer; credits
          cannot be cashed out or sent outside SkillSwap.
        </p>
        {sent === "1" && (
          <p className="success-notice">
            Gift sent. The recipient was notified by email when delivery is configured.
          </p>
        )}
        <p className="privacy-notice">
          Your spendable balance: {totals.spendable} credits · single gift 1–100 · rolling 24-hour
          limit 250 credits across 5 gifts. You cannot gift a Member you or they have blocked.
        </p>
        {!enabled && (
          <p className="privacy-notice">
            Credit movement is disabled until the Phase 1 ledger and cancellation rules are
            approved. No gift will be sent.
          </p>
        )}
        {!to && (
          <form className="admin-filter-form" action="/wallet/gift">
            <label>
              Find a Member by display name
              <input name="q" defaultValue={query} minLength={2} maxLength={80} required />
            </label>
            <button className="secondary-button">Search Members</button>
          </form>
        )}
        {recipients.length ? (
          <ul className="audit-list">
            {recipients.map((recipient) => (
              <li key={recipient.id}>
                <strong>{recipient.memberProfile?.displayName || "Member"}</strong>
                <span>
                  {recipient.memberProfile?.teachSkills.length
                    ? `Can teach: ${recipient.memberProfile.teachSkills.join(" · ")}`
                    : "SkillSwap Member"}
                </span>
                <form action={sendCreditGift} className="interaction-form">
                  <input type="hidden" name="recipientId" value={recipient.id} />
                  <input type="hidden" name="idempotencyToken" value={randomUUID()} />
                  <label>
                    Amount
                    <select name="amount" defaultValue="5" disabled={!enabled}>
                      <option value="1">1 credit</option>
                      <option value="5">5 credits</option>
                      <option value="10">10 credits</option>
                      <option value="25">25 credits</option>
                      <option value="50">50 credits</option>
                      <option value="100">100 credits</option>
                    </select>
                  </label>
                  <label>
                    Optional message
                    <textarea name="message" maxLength={240} rows={2} disabled={!enabled} />
                  </label>
                  <button className="primary-button" disabled={!enabled}>
                    Send gift
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : query.length >= 2 || to ? (
          <p className="empty-state">No eligible Members match this recipient.</p>
        ) : (
          <p className="empty-state">
            Search for a Member by their public display name to send a gift.
          </p>
        )}
      </section>
    </main>
  );
}
