# Phase 14 launch-readiness checklist

Use this checklist with a named owner and evidence link/date for every gate. A checked box means the evidence was reviewed for the target environment; it does not mean the code merely exists. Do not invite a public beta until every blocking gate is signed off.

## Product and data

- [ ] Confirm success targets for activation, request acceptance, session completion, repeat use, support response, and acceptable marketplace imbalance.
- [ ] Confirm analytics definitions in `beta-scorecard.md`; record baseline and reporting window.
- [ ] Confirm Member data export and deletion flows, retention rules, privacy notice, and support escalation contact.
- [ ] Confirm reports, disputes, appeals, mutes, blocks, and moderation queues have named response owners and coverage hours.
- [ ] Confirm search terms, messages, profile names, and private feedback are not used as analytics payloads.
- [ ] Confirm payment collection remains disabled until payment provider, refund flow, country/currency scope, and ledger controls are approved.

## Accessibility, security, and abuse

- [ ] Review key Member and Admin journeys at mobile, tablet, and desktop widths.
- [ ] Complete keyboard-only and screen-reader checks for signup, discovery, request, session, reporting, and Admin queues.
- [ ] Complete WCAG 2.2 AA review and track any accepted exceptions with an owner and date.
- [ ] Review authorization, resource ownership, role separation, rate limits, CSRF/origin protection, secret handling, and dependency findings.
- [ ] Exercise account restriction, safety report, no-show, dispute, appeal, block, and moderation cases with synthetic accounts.
- [ ] Confirm Admin MFA is enforced by the identity account and document that application MFA is not currently enforced.

## Hosting and recovery

- [ ] Name the production device owner and backup operator; record contact and escalation method.
- [ ] Verify domain, public ingress, TLS certificate renewal, reverse proxy, firewall, and private app listener.
- [ ] Verify automatic service start after reboot, process restart, health checks, alert delivery, disk monitoring, and resource capacity.
- [ ] Exercise power loss, ISP outage, router restart, device reboot, disk-full, and expired-certificate recovery.
- [ ] Confirm PostgreSQL and R2 backups, encryption, retention, access limits, and documented recovery point/objectives.
- [ ] Restore a backup into an isolated environment; verify login, exchange/session history, safety workflows, and ledger reconciliation.
- [ ] Verify previous release rollback and database compatibility procedure.
- [ ] Confirm ZeptoMail sender/domain configuration, delivery monitoring, suppression handling, retry worker schedule, and alerting.
- [ ] Confirm operator MFA, device encryption, OS patching, remote administration restrictions, and secret rotation.

## End-to-end rehearsal and beta decision

- [ ] Member signup, onboarding, skill publishing, discovery, request, acceptance, scheduling, meeting, completion, and review.
- [ ] Direct swap: normal completion, one participant cancels, mutual cancellation, no-show/emergency, and Admin resolution.
- [ ] Admin report review, dispute resolution, appeal, audit trail, and member notification.
- [ ] Payment provider sandbox purchase, duplicate callback, timeout/retry, refund, reversal, and balanced ledger (only after payments are approved and enabled).
- [ ] Confirm support coverage, incident commander, status communication, release rollback owner, and member-facing response templates.
- [ ] Review pilot enrollment, support load, category imbalance, user feedback, unresolved risks, and rollback triggers.
- [ ] Record go/no-go decision, approvers, date, scope, and the next review date.

## Evidence log

| Gate                 | Owner | Evidence / ticket | Reviewed on | Result / follow-up |
| -------------------- | ----- | ----------------- | ----------- | ------------------ |
| Accessibility        |       |                   |             |                    |
| Security and privacy |       |                   |             |                    |
| Backup restore       |       |                   |             |                    |
| Host recovery        |       |                   |             |                    |
| End-to-end rehearsal |       |                   |             |                    |
| Support and safety   |       |                   |             |                    |
| Beta go/no-go        |       |                   |             |                    |
