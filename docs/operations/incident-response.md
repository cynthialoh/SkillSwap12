# Incident response and support playbook

Fill in the named contacts, phone numbers, and status page before beta. Keep incident notes in an access-restricted system. Record request IDs and timestamps; do not include passwords, tokens, private messages, report details, or payment credentials.

## Roles and escalation

| Role                     | Owner / contact        | Responsibility                                                             |
| ------------------------ | ---------------------- | -------------------------------------------------------------------------- |
| Incident lead            | **Assign before beta** | Sets severity, coordinates response, approves updates and closure          |
| Host operator            | **Assign before beta** | Network, device, reverse proxy, process, database, backup and restore      |
| Application/Admin lead   | **Assign before beta** | Access, queues, moderation, release rollback, application logs             |
| Member support           | **Assign before beta** | Acknowledges Members, gives status updates, tracks follow-up               |
| Payment provider contact | **Not configured**     | Provider-side payment/refund investigation; required before real purchases |

Escalate immediately to the incident lead for suspected account takeover, exposed personal data, unsafe contact, ledger imbalance, widespread login failure, or service outage. Safety reports use the Admin safety queue and the designated support escalation channel; do not promise continuous emergency monitoring until staffing coverage is defined.

## First response

1. Create an incident record with incident ID, start time, reporter, affected environment, symptoms, and request IDs.
2. Assign the incident lead and severity. Set the next update time and identify which user journeys/data may be affected.
3. Preserve relevant logs and audit events with restricted access. Do not paste secrets or sensitive content into general incident notes.
4. Contain: restrict public ingress or affected actions as needed. For credit/payment integrity concerns, disable credit mutations and callbacks before attempting repair.
5. Communicate a factual status update through the configured status channel and provide a next update time.

## Severity guide

- **Critical:** active safety threat, confirmed data exposure, ledger corruption, or broad outage. Stop the affected journey, contact the incident lead immediately, and give frequent status updates.
- **High:** major feature unavailable, repeated payment/credit failure, safety queue unstaffed, or suspected unauthorized Admin access. Contain and investigate promptly; update affected users.
- **Moderate:** limited degradation with a safe workaround. Assign an owner and due time; disclose the workaround.
- **Low:** isolated cosmetic or non-blocking issue. Track for a scheduled release.

## Recovery and closure

1. For an unhealthy release, capture health/log evidence, route traffic away if needed, restore the last known-good artifact, and verify the critical journeys.
2. For data concerns, restore to an isolated environment first. Verify schema compatibility, account access, exchange/session history, audit trail, and credit ledger before returning traffic.
3. For safety cases, protect the reporter, preserve necessary evidence under restricted access, follow moderation policy, and record the Admin action through the application workflow.
4. For suspected credential exposure, revoke sessions, rotate relevant secrets, restrict Admin access, and review audit events.
5. Close only after service/data integrity is verified, users have a final update, and follow-up owners and dates are recorded.
6. Within five business days, document timeline, impact, cause, what worked, corrective actions, and whether the beta gate needs to change.

## Status update template

> **[Service / feature] — [investigating / identified / monitoring / resolved]**
>
> Started: [time and timezone]. Impact: [affected journeys in plain language].
>
> Current action: [brief action]. Next update: [time and timezone].

Do not publish member identities, report contents, private conversations, security details that enable abuse, or unverified causes.

## Release rollback record

| Field                          | Record |
| ------------------------------ | ------ |
| Incident / release             |        |
| Rollback owner                 |        |
| Previous artifact              |        |
| Database compatibility checked |        |
| Traffic and health verified    |        |
| Member communication sent      |        |
| Follow-up actions              |        |
