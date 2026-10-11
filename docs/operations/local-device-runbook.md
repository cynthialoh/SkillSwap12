# Local-device hosting and recovery runbook

## Environment map

| Environment | Purpose                                              | Data and credentials                                                                           |
| ----------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Development | Local coding on the developer workstation            | Synthetic-only fixtures; local secrets ignored by Git                                          |
| Preview     | Review a proposed change                             | Isolated database, R2 bucket, and email test/sandbox credentials; no production personal data  |
| Staging     | Exercise release and recovery procedures             | Production-like configuration with synthetic accounts and a distinct environment's credentials |
| Production  | Public service hosted on the designated local device | Real services, least-privilege credentials, backups, monitoring, and support ownership         |

Each environment has its own `.env`/secret store, PostgreSQL database/schema, R2 bucket, email sender configuration, and webhook credentials. Never copy production data into lower environments.

## Local development

1. Install Node.js 20.19+ and npm 10+.
2. From `skillswap-app`, copy `.env.example` to `.env` and set a local/managed development database URL.
3. Run `npm ci`, `npm run db:generate`, and the development migration command described in the app README.
4. Run `npm run dev`; keep the server bound to localhost. Do not expose the development server to the public internet.
5. Before committing, run formatting, lint, typecheck, and production build scripts. Do not commit `.env`, database dumps, object files, or logs containing personal data.

## Public local-device deployment gate

The public host location is a product choice, not an operational design by itself. Before public use, assign an operator and document:

- Static public ingress and a domain with valid HTTPS; terminate TLS at a maintained reverse proxy and forward only to the Node service on a private interface.
- Network/router/firewall ownership, restricted device administration, OS and dependency patch cadence, and MFA for operators.
- Automatic service start/restart after a crash/reboot; a monitored health endpoint; disk, memory, CPU, certificate, network, and process alerts.
- Stable power/connectivity or an explicit outage procedure and user-facing status communication.
- Encrypted managed-PostgreSQL backups, R2 retention/versioning appropriate to the data policy, backup access restrictions, and a timed restore drill.
- Rollback owner and steps: retain the last known-good artifact, apply backward-compatible migrations, route traffic back to it, and verify health before reopening.
- Secret rotation and incident response. Credentials must not be stored in source control, terminal history, committed service files, or logs.

Do not put verification evidence or real Member data on the host's local disk. The verification upload flow stores private evidence in R2, but keep collection disabled until private-bucket credentials, the daily retention worker, and the proposed 180-day retention rule are configured and approved.

## Incident and recovery notes

1. Record incident time, affected environment, operator, and request IDs; do not paste secrets or private message content into incident notes.
2. If a release is unhealthy, stop traffic at the proxy, restart only after logs/health are captured, and roll back to the known-good artifact.
3. If data integrity is uncertain, disable credit mutations and payment callbacks before attempting recovery. Preserve immutable ledger and audit records.
4. Restore to an isolated environment first; verify application/schema version and integrity before reconnecting public traffic.
5. After recovery, rotate affected credentials, document the cause and corrective action, and confirm monitoring returns to baseline.

## Admin access and offboarding

See [`admin-permission-map.md`](./admin-permission-map.md) for the application’s Member/Admin access boundaries.

- Provision an Admin only after the account has verified its email. Use `npm run admin:grant -- --email <verified-account> --reason "<operational reason>"`; an existing Admin must also supply `--granted-by <current-admin-email>`. The application has no Admin role selector or public grant endpoint.
- Require MFA on the identity account and the host-device operator account before granting production access. SkillSwap currently verifies email and checks the database Admin grant on every protected route/action, but does not enforce an MFA factor itself.
- Offboard through Admin → Members → Revoke Admin grant. The action requires a reason, revokes active auth sessions, audits before/after access, and refuses to remove the last active Admin. Also revoke identity-provider access, rotate shared secrets the person could access, and review recent audit records.
- If every Admin is locked out, use host/database operator access only. Confirm the configured `BOOTSTRAP_ADMIN_EMAIL`, temporarily set `BOOTSTRAP_ADMIN_RECOVERY=true` in the private environment, then run the documented `admin:grant` command for that verified bootstrap account without `--granted-by`. Recovery is audited as a system/bootstrap grant. Remove the recovery flag immediately, verify another trusted Admin, and record the operator, reason, and request ID in the incident log. Never use this path for routine onboarding.
- All 19 checked-in migrations are applied to the configured local database. Before deploying to another database, run `npm run db:status` and use the controlled deploy workflow; do not use queue assignment or the append-only audit log in an environment missing the Phase 11 migration. Do not export queue or audit records; use the in-app filters and request IDs for authorized incident review.

This runbook is a checklist, not evidence that a public route, TLS proxy, service manager, monitoring provider, or restore procedure is already configured.
