# SkillSwap application

This is the Next.js application for SkillSwap. The root `index.html` remains the static design prototype. Phases 0–7 cover the design foundation, authentication and onboarding, profiles and discovery, requests and messaging, safety controls, and scheduling. Phase 8 adds the credit ledger, wallet, session holds and settlement services; Phase 9 adds two-leg direct swaps and reviewed outcomes; Phase 10 adds reviews, Trust Levels, verification, disputes, and appeals; Phase 11 adds Admin operations and marketplace governance. The product owner approved the Phase 1 policy as `phase1-approved-v1` on 2026-10-10. Credit posting remains off by default and requires explicit environment configuration for a controlled beta.

## Requirements

- Node.js 20.19 or newer (Node 24 LTS is the current local runtime).
- npm 10 or newer.
- PostgreSQL for migration commands; the UI shell can run without a database URL.

## Local development

1. Copy `.env.example` to `.env` and set a private PostgreSQL `DATABASE_URL` before running database commands.
2. Install locked dependencies with `npm ci`.
3. Generate the Prisma client with `npm run db:generate`.
4. Apply the checked-in local migration with `npm run db:migrate:dev` to a fresh development database. For an existing database, inspect its state first.
5. Start the app with `npm run dev` and open `http://127.0.0.1:3000`. The development server binds only to loopback.

## Install as a PWA

The app includes a web manifest, branded 192/512-pixel install icons, an Apple touch icon, and a production service worker. On supported Chromium browsers, use the in-app **Install** button or the browser's install menu. On iPhone or iPad, use Safari's Share menu and choose **Add to Home Screen**. Remote devices require a valid HTTPS URL; `localhost` and `127.0.0.1` work for local installation, but a plain HTTP LAN address does not.

The service worker caches versioned frontend assets and branding only. It never stores pages, API responses, account information, messages, or credit data. When offline, navigation shows an offline notice; SkillSwap workflows still require a network connection. Service-worker registration is limited to production builds to avoid stale development assets.

### This device's local PostgreSQL

SkillSwap is configured with a dedicated PostgreSQL 17 database at `127.0.0.1:55432`. The database files are stored outside the OneDrive project directory at `%LOCALAPPDATA%\SkillSwap\PostgreSQL\data`; generated database and Better Auth secrets are in the ignored `.env`. All 19 checked-in app migrations are applied and `npm run db:status` reports the database is up to date. A verified pre-migration backup is stored under `%LOCALAPPDATA%\SkillSwap\PostgreSQL\backups`. The existing system PostgreSQL instance was left unchanged.

The `SkillSwap PostgreSQL` per-user startup task launches the dedicated database at sign-in. If it is stopped unexpectedly, start it manually in PowerShell with:

```powershell
$pgData = Join-Path $env:LOCALAPPDATA 'SkillSwap\PostgreSQL\data'
$pgLog = Join-Path $env:LOCALAPPDATA 'SkillSwap\PostgreSQL\postgresql.log'
& 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe' -D $pgData -l $pgLog -o '-h 127.0.0.1 -p 55432' start
```

The database connection is lazy; the design shell and `/api/health` do not connect to PostgreSQL. No real or sample Member/Admin records are seeded. `GET /api/health` is a liveness signal only; it does not claim database or email readiness.

The Phase 7 scheduling migration adds session, time-proposal, event-history, reminder, and private incident-review tables. Zoom and Google Meet links are encrypted with `SESSION_LINK_ENCRYPTION_KEY`, stored in the ignored local `.env`, and shown only to confirmed session participants. Set a unique, persistent key in each environment before saving links; changing it later makes existing encrypted links unreadable.

The Phase 8 and 9 migrations add an immutable, zero-sum credit ledger, hold records, direct-swap agreements, value snapshots, and audit history. Wallet balances are derived from member account postings. Direct swaps quote each deposit as half the value of the skill that participant wants to learn, rounded up with a 1-credit minimum. Both session times must be proposed before either time can be confirmed; when enabled, both deposits are held atomically first. Both participants must mark both legs complete before deposits return. Mutual cancellation requires both participants to confirm. Admin can review and resolve late cancellation/no-show, failure after a taught leg, and accepted emergency outcomes. Three upheld direct-swap no-shows suspend direct-swap access for 30 days without disabling other Member features.

Phase 12 adds a member-to-member credit gift workflow with recipient eligibility and block checks, idempotent balanced ledger transfers, amount and rolling daily limits, wallet history, and optional ZeptoMail notification. Its schema migration is applied. Gifts remain unavailable while the credit-policy gate is unset. Credit checkout, payment webhooks, refunds, chargebacks, welcome rewards, and referrals are not active: the owner must first approve launch countries, provider, currency/pricing, tax/refund rules, promotion eligibility/expiry, and funding/abuse controls. No payment processor is selected.

Phase 13 adds `/notifications` with in-app read state and `/notifications/preferences` with per-category in-app and email controls. Message and session updates enter a deduplicated database outbox; `npm run notifications:send` retries ZeptoMail delivery with bounded backoff. Schedule it on the local host. A crash after ZeptoMail accepts a message but before the worker records success can cause a duplicate email, so delivery is at-least-once in that narrow failure window. Existing session reminders keep timezone-aware formatting and now honor the email session preference.

`/community` supports short tips, projects/demos, progress updates, and tutorials, public or follower-only visibility, followed activity and skill-tag filters, adjustable feed volume, open learning opportunities, upcoming sessions, comments, appreciation, saves, reporting, and member mutes. Admins can review reports at `/admin/community`; hide/dismiss decisions are audited. Reads and actions enforce profile discoverability, visibility, blocks, mutes, and follow requirements. Phase 13's PostgreSQL migration is applied. The email worker still needs a local schedule and live ZeptoMail configuration before production use.

Phase 15 adds private Member learning plans at `/learning-plans`: skill goals, optional target dates, ordered milestones, completion reflections, progress, and pause/resume/complete states. Every lookup and mutation is scoped to the authenticated owner. Its migration is applied locally. The feature does not make the larger Phase 15 beta gate complete; pilot evidence, restore, accessibility/security sign-off, and support coverage remain necessary.

Credit holds, settlement, and Admin financial resolution require both `CREDIT_SETTLEMENT_ENABLED=true` and `SKILLSWAP_CREDIT_POLICY_APPROVED_VERSION=phase1-approved-v1`. The policy is approved, but settlement stays off by default. Use the isolated local walkthrough in [`../docs/operations/credit-verification.md`](../docs/operations/credit-verification.md) before considering a controlled beta. The Admin workspace shows open/frozen holds and recent ledger entries.

The app scripts use Next.js's Webpack builder and a project-local SWC cache. This keeps local builds independent of machine-wide cache permissions and supports Windows when the native SWC runtime is unavailable. `.swc-cache/` is generated and ignored by Git.

## Reviews, trust, verification, and disputes

Members may leave one review per completed session, with separate public and private feedback. Trust Level increases only with completed exchanges; ratings do not automatically cause penalties. Public profiles show visible reviews, average rating, verification badges, and Trust Level progress. Admin tools for verification, review moderation, disputes, appeals, and trust policy are at `/admin/trust`; sensitive decisions and evidence access are recorded in the security audit trail.

Verification files use private Cloudflare R2 objects. Configure the four `R2_*` values in `.env` before accepting evidence. Admin evidence links are short-lived; approved/declined files are scheduled for deletion 90 days after the decision, unless an appeal or legal hold applies. Run `npm run verification:retention` daily on the local host. The product owner approved this retention baseline; complete launch-country legal/privacy review before accepting production evidence. The dispute flow currently accepts private written reports and freezes active credit holds; dispute-specific file uploads and a full evidence timeline are not implemented. Credit outcomes and appeal reversals require the approved policy version and explicit settlement configuration.

## Admin operations

The Admin workspace is available only to verified accounts with an active `AdminGrant`. `/admin` links to the queue, member operations, catalog, sessions, metrics, audit log, and trust/verification areas. Every page and Server Action independently checks the grant. Account restriction/suspension and Admin offboarding require a reason and revoke active authentication sessions. An Admin grant cannot be revoked if that would leave no other active Admin. New grants are provisioned with `npm run admin:grant`; public self-service Admin registration does not exist.

Queue ownership and priorities are stored in `AdminQueueAssignment`. Assignment actions re-check that the selected person has an active Admin grant and is not a reporter, subject, or session participant on that item. Privileged events include a generated request ID in their audit details. The Phase 11 migration makes audit records append-only, allowing only foreign-key actor/target IDs to be nulled during account deletion; it is applied to the local database. Audit and operational screens redact email addresses and omit meeting links, credentials, and unrelated private details; no export endpoint is provided.

See [`../docs/operations/admin-permission-map.md`](../docs/operations/admin-permission-map.md) for the module access map and operator-only MFA requirement.

## Project checks

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

CI runs these checks on pull requests and pushes. No test suite is included in this phase; domain behavior tests belong with the phases that implement those behaviors.

## Environment separation

Use independent development, preview, staging, and production secrets in the deployment environment. `.env.example` contains placeholders only; never commit a real `.env` file. Preview/staging/production deployment and local-device ingress are documented in `../docs/operations/local-device-runbook.md`.

## Database

Prisma schema and SQL migrations are in `prisma/`. `db:migrate:dev` is for local development only. Use `db:migrate:deploy` for controlled release migrations. Better Auth identities/session records are separate from SkillSwap's Member domain data, and Admin privileges exist only as explicit, audited `AdminGrant` records.

## Sessions and reminders

Members schedule sessions manually from accepted exchanges. Time proposals use UTC instants plus IANA zones; each confirmed session lasts 60 minutes with a 5-minute buffer. Reschedules and cancellations inside 24 hours are recorded for Phase 8 settlement review. A session is complete only after both participants mark it complete. Credit movement remains disabled by default; the approved Phase 1 outcomes require explicit settlement configuration and operational/legal review before a controlled beta.

Direct swaps are tracked as linked agreements with two role-reversed session legs. Direct-swap time confirmation requires both legs to be scheduled, and an upheld no-show strike applies only to direct-swap eligibility. Financial outcomes stay disabled by default; enablement requires the approved policy version and explicit settlement configuration.

The default reminder is 24 hours before a session; each participant can change the lead time or turn it off. The local reminder worker is `npm run sessions:reminders`. Schedule it to run every 15 minutes on the host device. It sends through ZeptoMail when configured and retries undelivered reminders. Set `APP_BASE_URL` to the URL Members use to reach the app. Admin incident decisions are available in `/admin` and are written to the security audit log.

## Authentication and onboarding

Set `BETTER_AUTH_SECRET` to a random secret of at least 32 bytes. Set `BETTER_AUTH_URL` and `APP_BASE_URL` for the local app. Configure `ZEPTOMAIL_API_KEY` and a verified `EMAIL_FROM_ADDRESS` to deliver verification and password-reset messages. Without ZeptoMail credentials, development logs the verification/recovery link to the server console; production refuses to silently skip delivery.

Apply migration `20261009180000_auth_onboarding` before using the auth routes. New accounts require email verification and receive one Member record/profile automatically; signup has no role field. For the first Admin, set `BOOTSTRAP_ADMIN_EMAIL` to a verified account and run `npm run admin:grant -- --email admin@example.com --reason "Initial operator"`. Later grants require `--granted-by existing-admin@example.com`. If all Admin access is lost, an operator with database access can temporarily set `BOOTSTRAP_ADMIN_RECOVERY=true` and re-run the command for the configured bootstrap account; each grant and recovery is audited. Keep real credentials in `.env` or an operator secret store, never in Git.

## Storage and deployment

See `../docs/operations/r2-storage.md` for the private R2 setup boundary and `../docs/operations/local-device-runbook.md` for a host and recovery checklist. Do not expose the development server to the public internet. A public beta needs an HTTPS reverse proxy, network and restart ownership, monitoring, and successful backup/restore exercises.
