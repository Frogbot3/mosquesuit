# Phase 4 — financial management

Version **0.4.0**, implemented and verified on Windows x64. This is an offline **fictional-data demonstration**. Staff authentication is not implemented. The selectable administrator, accountant and viewer roles simulate permissions; they are not an authenticated staff system. Do not enter real financial or personal records.

## Open the current software

On this machine, double-click **Open-Mosque-Finance.cmd** in the project folder to open the built demo. This is a launcher, not an installer.

Alternatively, open PowerShell in `C:\Users\Lenovo\Documents\mosqedatacollecting` and run:

```powershell
npm.cmd run build
npm.cmd run demo:finance
```

After a successful build, subsequent launches need only `npm.cmd run demo:finance`. Close an older finance-demo window before launching an updated build. Dependencies are already installed on this development machine; on a fresh machine follow the README installation instructions first.

This opens the separate, initially empty `%APPDATA%\Mosque Suite Development\finance-demo\` workspace. Create fictional families there first. Registration and life events are also available in this demo. No ordinary workspace or life-events-demo records are copied into it. `npm.cmd start` opens the ordinary registration workspace; finance commands are denied there and in packaged builds.

There is **no completed current installer**. The old Phase 1 executable is not this release. Its Device Guard failure and the earlier NSIS helper failure were not bypassed or retried in Phase 4.

## Delivered

- Financial dashboard with actual SQLite totals, dates, month/year-to-date presets, ward/category/search filters, collection percentage, carry-forward balances, refunds and signed reversals.
- Monthly, annual and one-time contribution plans; descriptions, eligible wards, living-member/registration criteria, effective versions, household overrides/discounts, pauses/exemptions and explicit adjustments/waivers.
- Transactional dues generation with unique family/plan/period keys and repeat-safe command IDs.
- Family search, partial payments, oldest/specific allocations, advances and explicit credit application. Manual cash, UPI, bank, cheque and other methods; similar-entry warnings and duplicate external-reference rejection.
- Immutable sequential receipt snapshots, bilingual preview, A4/compact A5 PDF, native print, reprint, refund/reversal stamps and QR containing only an opaque local receipt ID.
- Configurable donation funds and restricted balances; anonymous donations; expense categories, approval rules, payee/bill reference/entered authorizer/recorder, approval history and exports.
- Current household plans, account balances, payment/adjustment history and date-filtered statements, linked from existing profiles and dashboard.
- Daily, monthly, ward, outstanding, overdue, donation, expense, fund, payment-method and full cash-ledger reports, plus household statements; preview, PDF, native print, CSV and actual XLSX output.
- Demo permissions enforced in the main process, session IDs, append-only financial audit, strict Zod validation and 25 narrow finance IPC methods.
- Consistent SQLite snapshots using the SQLite backup API, integrity/FK validation and a temporary destination before replacement. Snapshots include stored document BLOBs; encryption and a user-facing restore workflow remain pending.

## Accounting rules

All persisted monetary values use integer paise. Decimal form text is parsed without floating-point rupee multiplication. Finalized transactions, charges, allocations, adjustments, receipt snapshots and audit entries cannot be updated or deleted through the application or ordinary SQL update/delete statements. This is application/database integrity protection, not tamper-proof storage against someone controlling the local database file.

Cash and receivables are separate. Dashboard **collected** means gross contribution payments in the chosen dates; **donations**, **refunds** and **signed reversal cash movements** are separate figures. Net cash is their signed ledger sum less expenses. Dues use due dates; collection percentage is settlement of the selected billed cohort, not cash divided by bills. Outstanding reports include earlier unpaid dues as of the end date. Family accounts also show finalized future-period bills; date-limited reports can therefore differ.

Monthly versions and assignments begin on the first of a month. Annual versions and assignments begin on 1 January; generate a range containing January to bill that annual period. The annual due month is configurable. One-time bills use the later of the first plan date and first assignment date. There is no proration. Generation accepts at most 24 months per command. Household eligibility and policy are evaluated when generating; changing them does not erase an existing bill. Use an authorized adjustment for an existing balance. Deactivating a category prevents new entries in that category but does not automatically stop existing active plans; pause the plan or household assignment explicitly.

One contribution payment addresses one category and enters the general fund. Automatic allocation follows earliest due date, then period and ID, within that category; only already-started periods can receive the dated payment. Excess remains payment credit. Generating later bills does not silently consume that credit. Applying it requires a separate confirmation. Donations never create contribution credit.

Refunds first consume unused payment credit, then release allocated amounts, restoring the corresponding dues. Reversals offset the whole original posting. After a partial refund, use a refund of the remainder instead of reversing the original amount again. Expense/donation corrections use full reversals. Adjustments cannot reduce a charge below its paid amount or be dated before its existing allocation/adjustment history. Funds cannot go negative, including at an intermediate historical date. No inter-fund transfer is performed automatically.

Pending expense requests do not affect cash. Threshold/category/global approval rules require an administrator demo decision, including for an administrator-entered expense. Approval can fail if the chosen fund lacks cash on the original expense date. Bill attachment reference is a text reference; this phase does not add a new expense-document upload system.

Household statements aggregate daily movements so the two sides of a refund do not produce an artificial interim negative credit. **Only date filters apply to a selected household statement**; unrelated ward/category/search fragments cannot split a payment from its allocations. Other reports support those filters. Filtered fund reports show the selected portion, not necessarily the fund's complete balance. Family labels in reports use the current registration; historical ward attribution is retained on the charge/posting. Issued receipts retain their original guardian, house and mosque branding.

Receipt numbers are sequential by year, with a configurable prefix, and are never reused after reversal. A receipt's remaining balance is the snapshot immediately after its posting, not the household's current balance. Reprints keep that snapshot and add the current reversal/refund status. QR references identify local receipts only; there is no public verification service. Manually entered bank/UPI references are not bank-settlement evidence.

XLSX includes a formatted rupee sheet and an integer-paise sheet with total formulas and cached results. Text is written as text, not formulas. CSV quotes/escapes cells and protects formula-like text with a leading apostrophe; negative numeric-looking CSV values also receive this protection. Use XLSX when numeric spreadsheet types matter.

## Implementation map

| Area | Files |
| --- | --- |
| Contracts, validation, labels | `shared/finance.ts`, `finance-labels.ts`, `finance-channels.ts`, `contracts.ts` |
| Additive migration 4 | `electron/database/finance-migration.ts`, `migrations.ts` |
| Accounting and queries | `electron/database/finance-store.ts`, `finance-queries.ts`, `finance-reports.ts`, `store.ts` |
| Native boundary and output | `electron/finance-ipc.ts`, `finance-output.ts`, `main.ts`, `preload.ts` |
| Finance screens and common controls | `src/pages/Finance*.tsx`, `src/components/finance/`, `src/finance.css` |
| Existing-screen integration | `src/App.tsx`, `Layout.tsx`, `Dashboard.tsx`, `FamilyProfile.tsx`, `Settings.tsx`, `styles.css` |
| Startup/build/dependencies | `scripts/start.mjs`, `build-electron.mjs`, `package.json`, lockfile |
| Tests | `tests/unit/finance.test.ts`, `finance-ipc.test.ts`, `tests/e2e/finance.spec.ts`, updated bridge/schema fixtures |

Migrations 1–3 remain unchanged. Migration 4 adds normalized financial tables, foreign keys, indexes, unique constraints, integer bounds, allocation/fund guards and immutable-record triggers. A populated Phase 3 upgrade is tested. There is no destructive downgrade: older applications reject the newer schema. Keep a verified backup before an upgrade; do not remove migration history to force an older build to open it.

## Verification and manual walkthrough

Final check on **28 October 2026**: **66 unit/component tests passed; 22 Electron tests passed; 1 packaged test skipped**. TypeScript and the complete production build passed. Four final PDF samples (A4 payment, compact A5 payment, A4 donation and landscape ledger) each render as one page, with Malayalam text, totals and QR references visually checked. The generated XLSX was reopened and its typed cells/formula results checked; CSV formula protection and the SQLite snapshot were also verified. No physical-print or installer success is claimed.

Run `npm.cmd run check` for unit/component tests, TypeScript, production renderer/main/preload builds and real Electron regressions. On this host Playwright also needs Windows System32 and its WindowsPowerShell directory on PATH. Financial coverage includes the ₹150 × two months scenario, ₹100 + ₹50 settlement, duplicates/idempotency, credit application, refunds/reversals, chronological waivers, historical fund guards, annual/one-time billing, permissions, rollback on audit failure, persisted Unicode receipts and a 500-household/1,000-charge reconciliation.

The Electron tests create unique fictional profiles and remove only those verified test directories. They exercise real screens and reopen offline, export real PDFs/XLSX/CSV/SQLite snapshots, test invalid/unsaved forms, and scan finance screens in English and the receipt in Malayalam/dark appearance at 1000 × 720. Export samples are under ignored `tmp/pdfs/`. Every final sample PDF page is rendered and visually checked; no physical printer is available for a paper-output check.

1. Start `demo:finance`. Add one fictional household in Family Registry.
2. Open Payments & Dues → Contribution plans. Save a monthly ₹150 plan, effective 1 January 2026. Assign it to the household with the same date and a reason.
3. Generate January–February 2026. Expect two dues totalling ₹300. Repeat; expect zero new dues and two duplicates skipped.
4. Record ₹100 on 15 February using oldest-due allocation. Review and confirm. The first due has ₹50 remaining; total outstanding is ₹200. Save/reopen the receipt PDF.
5. Record ₹50. The first due is settled and the second remains ₹150. From the transaction, reverse that ₹50 with a reason; outstanding returns to ₹200 and its receipt says REVERSED / VOID.
6. Record ₹200 into Zakat. Set an expense approval rule, submit a ₹50 expense against Zakat, and approve it as the administrator demo role. Zakat closes at ₹150; general-fund cash remains separate.
7. Compare daily, methods, full-ledger and fund reports for the same dates/filters. Open a household statement; verify donations do not become advance contribution credit. Export XLSX and inspect both sheets.
8. Select the viewer demo role. Reports remain readable, but posting controls and main-process write requests are denied.
9. In Finance settings, choose a fictional PNG logo and save a SQLite snapshot. Issue a new receipt, change branding, then reprint the old receipt to check its preserved snapshot.
10. Close/reopen the finance demo without internet and verify records, balances and receipt references remain available. Try Malayalam and compact A5 output.

## Remaining release limits

Authenticated staff identities, secure login/session locking, production ward scope, encrypted backup/restore, bank reconciliation, signed installer/upgrade testing, physical printer testing and an administrator-reviewed live accounting policy are still required before real-world use. Demo roles can be switched by anyone and default to administrator in a new demo session. The database and exported snapshots are unencrypted. Entered staff names are labels, not verified identities.

The existing immutable life-event/registration histories remain independent; no WhatsApp, automated reminders or payment gateways were added. Family-sheet printing, staged imports and ward editing remain deferred from earlier phases. Phase 5 has not been started.

Implementation references: [SQLite backup API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#backupdestination-options---promise), [ExcelJS](https://github.com/exceljs/exceljs), [local QR generation](https://github.com/soldair/node-qrcode).
