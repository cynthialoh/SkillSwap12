# Closed-beta scorecard

This scorecard reports aggregate marketplace health. Use a consistent 30-day cohort/window and include the sample size beside every rate. Small cohorts can make percentages misleading; show counts and suppress demographic breakdowns.

## Metric definitions

| Metric                 | Definition                                                                                       | Current source                                         | Target                               |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------ |
| Activation             | Member profiles whose onboarding completion timestamp falls in the reporting window              | `MemberProfile.onboardingCompletedAt`                  | Set before pilot                     |
| Skill supply           | Active listings split by category and teach/learn direction                                      | Active `SkillListing` rows                             | Review category gaps weekly          |
| Request acceptance     | Accepted exchange requests plus accepted learning-request responses divided by all such requests | Request/response current statuses                      | Set before pilot                     |
| Session completion     | Completed sessions divided by all session records                                                | `Session.status`                                       | Set before pilot                     |
| No-show rate           | No-show and reported no-show sessions divided by all sessions                                    | `Session.status`                                       | Set before pilot                     |
| Dispute rate           | Disputed sessions divided by all sessions                                                        | `Session.status`                                       | Set before pilot                     |
| Repeat participation   | Members with more than one completed session                                                     | Completed session participant IDs, counted server-side | Set before pilot                     |
| Direct-swap settlement | Settled direct swaps divided by all direct swaps                                                 | `DirectSwap.status`                                    | Set before pilot                     |
| Trust changes          | Trust-level changes recorded in the window                                                       | `TrustLevelEvent`                                      | Monitor for unusual spikes           |
| Ledger integrity       | Number of ledger transactions whose entries do not sum to zero                                   | `CreditLedgerEntry` grouped by transaction             | Zero                                 |
| Safety queue           | Open/in-review reports plus reports resolved in the window                                       | `SafetyReport`                                         | Response target set by support owner |

## Interpretation limits

- The Admin dashboard provides current all-time totals for conversion and lifecycle metrics and 30-day counts for new members, onboarding, listings, trust changes, and resolved safety reports.
- Search impressions are not stored, so search-to-request conversion cannot be calculated. Do not infer it from request counts.
- Completed sessions are used as a proxy for repeat learning. A richer exchange-level cohort analysis needs an agreed definition and reporting window.
- A `PURCHASE` ledger transaction count is not provider revenue, settled money, or proof that a payment provider callback succeeded. Real purchases remain gated.
- Ledger zero-sum checks prove only that recorded entries balance per transaction; they do not validate business correctness, external payment settlement, or missing transactions.
- Category listing counts show declared supply and interest, not active availability or unmet demand volume.
- There is no agreed product target yet. Agree targets and minimum sample sizes before evaluating a beta cohort.

## Weekly beta review

1. Record the date range, active cohort size, and dashboard snapshot.
2. Review supply gaps, accepted requests, completion, repeat participation, no-shows, disputes, and open safety cases.
3. Read support themes without copying private messages into analytics or scorecard notes.
4. Assign each material issue an owner, severity, due date, and rollback/mitigation decision.
5. Pause expansion if ledger integrity is non-zero, a critical security/accessibility issue is open, safety response coverage fails, or restore readiness is unproven.
