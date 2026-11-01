# Phase 7 verification and pilot readiness

Version **0.7.0**, report prepared **1 November 2026**. **CONDITIONAL** for supervised evaluation with fictional records; **NOT READY** for real mosque records or live providers. This phase stabilizes the existing application; it does not turn planned navigation into implemented features or certify production security.

## Delivered behavior

The separate pilot workspace contains four wards, 500 fictional families, 2,500 members, twelve months of dues, 2,000 payments, sample events, an attachment, audit entries and pending notifications. No staff account is shipped. First launch requires the user to create an administrator; later launches retain that profile and any restored generation. The source kit includes built assets, pinned dependencies, tests, the checksum-verified fictional database and staff documentation. It still requires Node.js and an initial dependency installation.

Start using `Open-Mosque-Pilot.cmd`. Follow [the staff guide](PHASE-7-PILOT.md), [Malayalam quick start](PHASE-7-QUICKSTART-ML.md) and [issue template](PHASE-7-ISSUE-TEMPLATE.md). The [audit matrix](PHASE-7-AUDIT.md) distinguishes complete, partial, demo-only, missing and environment-blocked capabilities.

## Executed checks

| Check | Actual result |
| --- | --- |
| ESLint, including React hooks | Passed, zero errors/warnings |
| Translation catalogue validation | Passed: 674 English/Malayalam pairs in six catalogues; no damaged placeholders or duplicate keys |
| Unit/component/service/security/migration suite | **115 passed in 19 files** in the final quality-gate run |
| TypeScript and production builds | Passed: renderer, Electron main/preload and mock integration service |
| Electron regression suite | **30 passed, zero failed; one packaged test explicitly skipped** in the final run |
| Separate real-Electron load suite | 2 passed, for 500 families/2,500 members and 2,000 families/10,000 members |
| Service benchmark and fresh-profile restore | Both sizes passed before and after optimization; accounting and recovery assertions included |
| Native dependencies | SQLite 3.53.4 and Argon2id verification passed in host Node; unit suite also uses Electron's Node runtime |
| PDF/font and screenshot review | Both final twelve-month PDFs and six Malayalam zoom-layout captures inspected; embedded Malayalam regular/semibold font data verified |
| Dependency audit | 25 moderate, zero high/critical in the review; unresolved release gate, see below |
| Windows installer lifecycle | Not verified; prior Device Guard exit 4551 and NSIS helper failure remain unresolved |

Commands: `npm.cmd run check` and `npm.cmd run qa:load` both completed with exit status 0; also ran `node scripts/qa.mjs benchmark optimized-v1`, `node scripts/verify-native.mjs`, and `npm.cmd audit --json` (the audit reports unresolved findings). The frozen original implementation supplied the before measurements. Raw benchmark/UI/font/audit evidence is under [phase7-evidence](phase7-evidence/); the performance report describes the hardware, every timing and sampling limits. Logs are retained locally in `tmp/phase7-check-verified.log` and `tmp/phase7-load-verified.log`. The final unit run took 95.54 seconds, the desktop suite 4.1 minutes, and the separate load suite 1.2 minutes.

The Windows test process needs `C:\Windows\System32` and `C:\Windows\System32\WindowsPowerShell\v1.0` on PATH. A harmless FORCE_COLOR/NO_COLOR warning appeared in Playwright output; native exit status and actual assertions determine the result. A Vite build also reported slow plugin callbacks; builds still completed. The Browser plugin was unavailable, so rendered verification uses the existing real-Electron Playwright harness, including native IPC and output.

## Defects fixed and verification limits

1. Four security confirmation translations and one finance backup message contained literal question-mark corruption. Replaced them with Malayalam and added an AST-based bilingual-catalogue gate. Startup/retry/route errors, backup history statuses and recovery/backup native dialogs now use translation labels.
2. Changing the selected role could discard unsaved permission edits. The role editor now offers Keep editing/Discard changes and disables switching while saving. The new Electron scenario verifies preserved edits, confirmed discard and Malayalam dialog text.
3. Notifications still showed an obsolete role-impersonation selector, whose backend correctly rejected every request. Replaced the misleading control with the signed-in access label. The test also verifies that direct legacy role selection remains forbidden.
4. Horizontal financial-table scrolling was inaccessible to keyboard focus. The wrapper now has a named region and a tab stop. The load suite caught this issue and passed its WCAG A/AA scans after correction.
5. Repeated full setup loads, optional-parameter SQL filters and quadratic outstanding-report grouping increased work at scale. Targeted query/calculation changes preserve bound parameters, permissions, monetary rules and historical records. No migration changed.
6. The packaged smoke test predated authentication/schema 6 and risked using the ordinary preview profile. It now requests a strictly validated UUID QA storage location, authenticates normally and verifies production feature gates. This code is typechecked; packaged execution is still unverified.
7. The full desktop run exposed an outdated expectation for the old “no staff account” activity label. The application already displayed “Local workspace history”; the assertion now checks that current label while preserving its persistence checks.

The first load harness incorrectly expected 25 registry rows (the actual registry page size is 10). Its expectation was corrected. The next run found the real keyboard-scroll issue. Later visual inspection caught blank/misplaced CDP screenshots at non-unit Electron zoom; the harness now waits for translated content, scrolls to the heading and uses native Electron captures. These corrections are documented rather than treating the earlier attempts as passes.

## Workflow, accounting and recovery evidence

Registration tests cover guardian/member creation, validation, duplicate prevention, SQLite persistence through an actual application restart, edits, guardian replacement, retained removal, conflict handling, search and paging. Separate life-event tests cover confirmed marriages, internal/external spouse cases, linked divorce without erased history, deaths/living counts, guardian reassignment warnings, confirmed household transfers with both histories and persisted attachments. **Ward creation and family-sheet printing remain missing**, so those two requested workflow steps are explicitly blocked rather than marked passed.

Finance tests cover integer paise, partial then remaining payment, unique dues/receipts, effective-date plans, allocations, credit, authorized refunds/reversals, donations, expense approval, restricted funds and daily/monthly/ledger reconciliation. The new deterministic varied-accounting test uses 20 families, 120 dues, varied payments and 20 separate corrections. After every correction it verifies nonnegative balances, allocation bounds, report reconciliation, idempotent retries and unchanged original finalized transaction/receipt rows.

Mock messaging/payment tests cover consent, approval/offline queues, duplicate suppression, retry/failure states, forged/replayed webhook rejection, exactly-once reconciliation and receipt notifications. The load test asserts pending approval jobs with zero attempts while disconnected. No real messages or payment transactions were sent.

Recovery tests cover wrong passphrases, corrupt/authenticated-but-invalid archives, schema mismatch, safety copies, staged activation, real app restart and paired service snapshots. The new disk-full test injects ENOSPC at archive staging: the active database/pointer, financial totals and earlier archive remain unchanged; failure history is recorded, temporary output removed and the busy lock released. It does not fill the real system drive.

The fresh-profile drill withholds the original profile, restores to a separate fictional profile and verifies family/member counts, financial reports, exact attachment bytes, pending jobs, audit-chain integrity and paired service SQLite integrity. Both large benchmark datasets also pass restoration/reconciliation. An owned child process exits with an open SQLite transaction; uncommitted edits roll back and existing committed manual payments/totals survive. This is a process-interruption test, not a physical power-loss/storage-firmware certification.

## Performance findings

At 2,000 families, median outstanding-report time changed from **1,012.34 to 356.34 ms** and an individual family's finance summary from **19.51 to 5.15 ms**. Encrypted backup took **2.64 s**; restore preview **1.20 s**, followed by activation including safety backup **1.20 s**. These exclude human entry/transport/verification time. Some operations were slower in the after sample; the [complete measurements](PHASE-7-PERFORMANCE.md) show all results.

The larger final Electron run rendered its ledger/filter interaction in **1.15 s**, produced the bilingual monthly PDF in **0.60 s** and completed dues IPC in **7.74 s** while the renderer timer continued. Fresh-process launch was variable: the final 500-family sample took **36.71 s**, while the 2,000-family sample took **2.79 s**. This unexplained launch variance needs representative staff-machine measurement; it is not evidence of a record-count scaling improvement. Main-process heavy operations remain synchronous. The pilot must account for these delays and memory usage.

## Security and privacy findings

The reviewed boundary retains sandbox/context isolation, disabled renderer Node integration, local CSP/assets, blocked external navigation/downloads, strict IPC schemas/senders, service authorization, ward enforcement, export grants and per-session async-operation checks. Argon2id credentials, role revocation, lock/recovery behavior, append-only/hash-chained audit and authenticated encrypted backups remain covered. No additional critical/high-severity defect was established in this review; that is not a penetration-test certification.

The dependency audit reports **25 moderate package findings, zero high and zero critical**. They propagate the minimatch advisory through builder/export/lint dependency chains; they are not 25 independent root flaws. Five additional affected package entries came with development lint tooling compared with the Phase 6 count of 20. The [upstream advisory](https://github.com/isaacs/minimatch/security/advisories/GHSA-g3hv-75wg-m249) describes attacker-controlled glob amplification with optimization level 2 or greater and identifies 11.0.1 as patched. npm's affected-range propagation is broader than the upstream example. Some automated suggestions downgrade major consumers; no forced downgrade or incompatible global minimatch override was applied. Treat remediation/explicit review as a release gate, even though the app does not offer arbitrary user glob input. See [raw audit](phase7-evidence/dependency-audit.json).

Working databases remain plaintext, and Windows administrator access can bypass app permissions or alter/recompute local audit history. Approve Windows account controls, full-disk encryption, protected backup/export custody, recovery credentials, retention and incident procedures before real data. Backup custodians can access whole-workspace snapshots. No real profile was used as a fixture, and recovery files/user databases are excluded from the kit.

## Remaining gates and Phase 8 priorities

1. **Release owner:** supply approved signing/trust configuration and verify install, upgrade, uninstall, native modules and data preservation on clean Windows. Follow the exact [manual installer checklist](PHASE-7-PILOT.md#windows-installer-verification-on-an-allowed-machine); do not disable Device Guard.
2. **Engineering/security owner:** resolve compatible dependency updates and retest exports/packaging; review startup variance and main-process workload on representative hardware; obtain independent boundary/recovery review.
3. **Mosque administrator and Malayalam-speaking clerk:** review accounting, divorce, consent and recovery terminology; test Windows native DPI, screen-reader/keyboard workflows and the real printer; perform an independently observed recovery rehearsal. Some stored technical audit action/summary strings remain English, and user-entered/bilingual record values are not rewritten when language changes. Complete language acceptance is not claimed.
4. **Data custodian:** approve Windows protection, retention, backup/recovery custody and privacy/incident procedures. Do not import real records until authorization/recovery/deployment controls are accepted.
5. **Product owner:** scope ward creation/editing, family-sheet output and staged imports; decide whether global events/reports/integrations need finer ward scoping. Existing restricted registry access does not make those all-ward workflows ward-filtered.
6. **Integration owner:** keep live provider activation separate, including approved credentials, webhooks, consent, hosted-service operations and its recovery plan. Phase 7 ships only mock/test behavior.

## Files changed

| Group | Files |
| --- | --- |
| Finance performance | `electron/database/authorized-services.ts`, `finance-queries.ts`, `finance-reports.ts`, `finance-store.ts` |
| Desktop/localization/UX | `electron/main.ts`, `electron/security-ipc.ts`, `shared/security-labels.ts`, `shared/finance-labels.ts`, `src/App.tsx`, `src/components/SecurityProvider.tsx`, `src/components/finance/FinanceShared.tsx`, `src/components/integrations/IntegrationShared.tsx`, `src/pages/Security.tsx` |
| Quality configuration and lint cleanup | `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `scripts/check-localization.mjs`, `electron/backup-service.ts`, `service/providers.ts`, `tests/unit/finance.test.ts` |
| New assertions and workload tooling | `tests/unit/accounting-invariants.test.ts`, `tests/unit/pilot-recovery.test.ts`, `tests/fixtures/load-dataset.ts`, `tests/load/pilot.spec.ts`, `playwright.load.config.ts`, `tests/e2e/desktop.spec.ts`, `tests/e2e/staff-security.spec.ts`, `tests/e2e/packaged.spec.ts`, `scripts/qa.mjs`, `scripts/qa/benchmark.ts`, `scripts/qa/seed.ts`, `scripts/qa/pilot-data.ts` |
| Pilot delivery | `Open-Mosque-Pilot.cmd`, `scripts/start-pilot.mjs`, `scripts/package-pilot.mjs`, `.gitignore`, generated `pilot-data/` and evaluation kit under `release/` |
| Documentation/evidence | `README.md`, `docs/ROADMAP.md`, `docs/PHASE-7-AUDIT.md`, `PHASE-7-PERFORMANCE.md`, `PHASE-7-VERIFICATION.md`, `PHASE-7-PILOT.md`, `PHASE-7-QUICKSTART-ML.md`, `PHASE-7-ISSUE-TEMPLATE.md`, `docs/phase7-evidence/` |

The original visual identity and implemented workflows are retained. Earlier phase documentation remains historical; this report and its linked evidence define the current verification scope.
