# Credit policy verification (local only)

This walkthrough uses synthetic accounts and a dedicated local PostgreSQL database. It never enables credits on the regular SkillSwap database. Do not use real member accounts, payment credentials, or production data.

## 1. Prepare an isolated database

Create a local PostgreSQL database named `skillswap_verify`. In PowerShell, from `skillswap-app`, point the app to that database. Use your normal local PostgreSQL connection details, changing only the database name:

```powershell
$env:DATABASE_URL = "<local PostgreSQL URL ending in /skillswap_verify?schema=public>"
$env:APP_ENV = "verification"
$env:CREDIT_SETTLEMENT_ENABLED = "false"
npm run db:migrate:deploy
npm run dev
```

Keep this terminal open. Register two synthetic Members and one Admin, for example `learner@example.test`, `teacher@example.test`, and `admin@example.test`. With no ZeptoMail credentials configured in development, verification links are printed in the server terminal; open each link locally. In a second terminal, point to the same verification database and bootstrap the test Admin:

```powershell
$env:DATABASE_URL = "<same local PostgreSQL URL ending in /skillswap_verify?schema=public>"
$env:APP_ENV = "verification"
$env:BOOTSTRAP_ADMIN_EMAIL = "admin@example.test"
npm run admin:grant -- --email "admin@example.test" --reason "Disposable credit verification"
```

Stop the app before seeding. In the terminal where you will run the fixture, set:

```powershell
$env:DATABASE_URL = "<same local PostgreSQL URL ending in /skillswap_verify?schema=public>"
$env:APP_ENV = "verification"
$env:CREDIT_SETTLEMENT_ENABLED = "false"
$env:VERIFICATION_FIXTURE_CONFIRMATION = "I_ACKNOWLEDGE_DISPOSABLE_VERIFICATION_DATA"
npm run verification:credits -- --member-a "learner@example.test" --member-b "teacher@example.test"
```

The fixture adds 100 synthetic credits to each new Member using balanced, immutable ledger entries. It refuses to run if the host is not local, the database name lacks `_verify`, `_verification`, or `_test`, the environment is production, settlement is enabled, the explicit confirmation value is missing, or either Member already has ledger history. It is idempotent for the same two accounts. It does not delete or reset data.

## 2. Enable settlement only in this shell

Start the app from a terminal configured for the same verification database:

```powershell
$env:DATABASE_URL = "<same local PostgreSQL URL ending in /skillswap_verify?schema=public>"
$env:APP_ENV = "verification"
$env:SKILLSWAP_CREDIT_POLICY_APPROVED_VERSION = "phase1-approved-v1"
$env:CREDIT_SETTLEMENT_ENABLED = "true"
npm run dev
```

Open `http://127.0.0.1:3000`. These environment variables affect only that terminal and its child process. Keep the regular `.env` setting at `CREDIT_SETTLEMENT_ENABLED="false"`. Stop the server after verification and set the flag back to `false` in the verification terminal.

## 3. Run the manual scenarios

Use the learner for credit-based sessions and the teacher as the counterparty. Use a listed session price of 8 credits. Review both Member wallets and the Admin ledger after every action.

| Scenario                                        | Expected result                                                                                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Confirm session                                 | 8 credits move from learner spendable to learner held; no teacher or platform posting yet.                                                         |
| Both participants mark complete                 | Learner spends 8; teacher receives 7; platform retains 1.                                                                                          |
| Learner cancels more than 24 hours before start | Full 8-credit hold returns; no penalty.                                                                                                            |
| Learner late-cancels or is confirmed as no-show | 1 credit goes to teacher; remaining 7 returns to learner.                                                                                          |
| Teacher late-cancels or is confirmed as no-show | Learner receives the full 8 back and 1 reserve-funded bonus credit.                                                                                |
| Admin accepts an emergency                      | Ordinary penalty is waived; affected participant receives 4 credits from the reserve; unrelated holds are released.                                |
| Direct swap valued at 7 and 4                   | Deposits are 4 and 2. Complete both legs or mutually cancel to return both deposits. Also check the Admin resolution flow after one leg is taught. |
| Retry an action or resolve a dispute            | No duplicate posting. Any reversal adds linked compensating entries; original ledger entries stay unchanged.                                       |

For every scenario, verify spendable and held totals, the corresponding hold status, an Admin audit event where required, and a zero-sum total for every ledger transaction. Confirm that any three upheld direct-swap no-shows within 12 months trigger only the 30-day direct-swap restriction.

## Limits

This is a manual acceptance walkthrough, not an automated integration test suite. The fixture only creates starting credit balances; it does not seed sessions or directly set ledger balances. Production payment checkout, refunds/chargebacks, verification uploads, legal/privacy review, and public launch remain outside this verification and still require their separate decisions and readiness work.
