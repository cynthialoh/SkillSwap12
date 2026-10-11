# SkillSwap Admin permission map

SkillSwap has two application account types: Member and Admin. Teaching, learning, requester, reporter, and participant roles describe an activity or relationship; they do not grant an Admin capability.

| Capability                                      |              Member |         Active Admin grant | Additional boundary                                                                                              |
| ----------------------------------------------- | ------------------: | -------------------------: | ---------------------------------------------------------------------------------------------------------------- |
| Read own Member workspace                       |                 Yes | No Member workspace access | Active account and verified email                                                                                |
| Search Member accounts                          |                  No |                        Yes | Admin page masks email; no export endpoint                                                                       |
| Restrict/suspend/restore an account             |                  No |                        Yes | Cannot change own account or another Admin through this action; reason required; sessions revoked on restriction |
| Revoke an Admin grant                           |                  No |                        Yes | Reason required; at least one other active Admin must remain; active sessions revoked                            |
| Review safety reports and session incidents     | Own submission only |                        Yes | Private report content; conflict-free assignment required                                                        |
| Review disputes and appeals                     |       Own case only |                        Yes | Private case text; conflict-free assignment; member-facing summary is separate                                   |
| Review verification evidence                    |  Own request status |                        Yes | Evidence route independently requires Admin; short-lived link; access audited                                    |
| Moderate public reviews and change trust policy |                  No |                        Yes | Reason required; action and before/after recorded                                                                |
| Assign queue owner and priority                 |                  No |                        Yes | Assignee must have an active Admin grant and not be a case participant                                           |
| Manage marketplace categories                   |                  No |                        Yes | Reason required; action audited                                                                                  |
| Read operational sessions and aggregate metrics |                  No |                        Yes | Meeting links, message bodies, and unrelated private notes excluded                                              |
| Read audit events                               |                  No |                        Yes | Append-only database trigger; details hidden in list; request IDs shown for correlation                          |
| Export Admin or Member records                  |                  No |                         No | No export endpoint is implemented                                                                                |

Every `/admin` page, Server Action, and private evidence route checks the current verified session and database-backed Admin grant server-side. The current release uses one Admin capability level; it does not implement team/role-based sub-permissions. Admin accounts must use MFA at the identity-provider level before public operations because the app does not yet enforce an MFA factor itself.

Provision and recover Admin grants only through the steps in [`local-device-runbook.md`](./local-device-runbook.md). The Phase 11 database migration is applied locally; use `npm run db:status` to confirm migration state in another environment before relying on queue assignments or append-only audit enforcement there.
