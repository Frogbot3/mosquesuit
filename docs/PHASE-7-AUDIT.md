# Phase 7 application audit and prioritized risk register

Initial inspection: 31 October 2026. Baseline: Phase 6 source, 111 passing unit/component/service tests and 29 passing Electron scenarios, one packaged smoke test skipped. Uncommitted Phase 6 work is preserved. This document describes observed capabilities, not promises inferred from navigation.

## Completion matrix at the start of Phase 7

| Area | Classification | Evidence and limitation |
| --- | --- | --- |
| Offline shell, local assets, settings, dashboard counts | Fully implemented | `main.ts`, `store.ts`, `WorkspaceProvider`, desktop restart/offline tests |
| Four seeded wards, directory/search | Fully implemented | Migration 1 and `Wards.tsx` |
| Create/edit wards | Missing | No write contract, IPC endpoint or editor; ward creation workflow cannot be claimed passed |
| Family/guardian/member registration and persistence | Fully implemented | Registration schema/service, paged directories, revision checks and Electron workflows |
| Family-sheet printing | Missing | Explicit planned control; no template/output endpoint; full family workflow remains incomplete |
| Staged imports and general document/certificate module | Missing | Planned navigation only; no import parser or arbitrary file-import API |
| Marriage/divorce/death and household transfer | Mock/demo only | Real SQLite workflows with permissions/history/attachments, gated to fictional workspaces |
| Contribution plans, dues, manual payments, receipts, funds and expenses | Mock/demo only | Real accounting/transaction services and regression tests; demo gate and confirmations remain |
| PDF/CSV/XLSX financial reports and event PDFs | Fully implemented within demo | Real generated files; physical printer behavior requires manual verification |
| WhatsApp/payment integrations | Mock/demo only | Local mock service, signed simulated webhooks, queues/reconciliation; no live provider activation |
| Offline staff login, lock, recovery and roles | Fully implemented | Argon2id, IPC and service enforcement, per-user sessions and current-password confirmations |
| Ward authorization | Partially implemented | Registry is ward-scoped; global life-event/report/integration/admin workflows require all wards |
| Audit and sensitive-data controls | Fully implemented within documented threat model | Append-only/hash-chain audits, masked legacy identity references, export grants; Windows admin can bypass local controls |
| Encrypted backup, retention and staged restore | Fully implemented | Online snapshots, optional paired service snapshot, AES-GCM, safety archive and restart tests |
| English/Malayalam | Partially implemented | Local fonts and extensive translations exist; some raw statuses/errors/dialogs remain; native-speaker sign-off pending |
| Financial integrity tests | Partially implemented | Existing deterministic invariants; larger randomized/recovery reconciliation needed |
| Scale/performance evidence | Partially implemented | Existing 500-family dues/backup assertions; no measured 2,000-family baseline or UI responsiveness report |
| Automated quality gates | Partially implemented | TypeScript/build/unit/Electron present; ESLint and repeatable pilot benchmarks absent |
| Windows installer | Broken in this environment | Historical Device Guard 4551 / NSIS helper failure; no verified current installer, no policy bypass |
| Controlled pilot materials | Missing | Phase guides exist; consolidated staff checklist, Malayalam quick start and reproducible demo package needed |

## Prioritized issue register

| ID | Priority | Finding / required action | Initial status |
| --- | --- | --- | --- |
| P7-01 | P0 release gate | No verified installer; obtain allowed clean Windows environment, sign and test install/upgrade/uninstall without bypassing policy | Open external gate |
| P7-02 | P0 real-data gate | Working DB is plaintext; local administrator threat, privacy/retention and independent recovery review require organizational controls | Open deployment gate |
| P7-03 | P1 | Establish reproducible isolated 500/2,000-family datasets, financial invariants and full loss/restore reconciliation | In progress |
| P7-04 | P1 | Exercise disk-full and interrupted-operation recovery; prove failed restore leaves current data/pointer intact | In progress |
| P7-05 | P1 | Financial queries use optional-parameter OR filters and repeated plan/assignment reads; measure before optimizing | In progress |
| P7-06 | P1 | Financial tables already display 25 rows per page, but report callers format every returned row; measure rendering and pagination stability | In progress |
| P7-07 | P1 | Add ESLint correctness gate and fix actual findings, preserving behavior | In progress |
| P7-08 | P1 | Review hardcoded English, raw technical errors/statuses, role-editor unsaved changes and scaled layouts | In progress |
| P7-09 | P1 | Dependency audit has 20 moderate findings, no high/critical; verify current upstream options without forced incompatible upgrades | Open review |
| P7-10 | P2 scope gap | Ward creation, family-sheet printing and imports missing; document blocked workflow steps for Phase 8, do not invent passing tests | Deferred feature work |
| P7-11 | P2 | Provide staff guides, issue template, acceptance/rollback checklist, fictional demo package and measured readiness decision | In progress |

No additional critical/high-severity vulnerability has been established at initial inspection. This is not an independent penetration-test certification. Test failures and newly discovered issues will be added with evidence during stabilization.

## Execution and safety boundaries

1. Preserve source work and user profiles; generate data only in uniquely created QA directories with a marker and no overwrite option.
2. Measure current service and real-Electron behavior before query/UI optimization; retain raw machine-readable measurements and hardware details.
3. Fix measured bottlenecks and correctness/authorization/localization defects with focused tests. Keep migrations 1–6 immutable; add a migration only if required.
4. Run accounting and recovery drills using fictional records, including a fresh-machine profile. Do not contact live providers or fill the actual drive to simulate disk exhaustion.
5. Run lint, TypeScript, unit/service/migration/security suites, production build and real-Electron workflows. Document packaged testing limitations and exact manual steps.
6. Deliver a fictional pilot bundle without a shared administrator password, plus a READY / CONDITIONAL / NOT READY decision distinguishing demo evaluation from real-data use.

Rendered QA uses the repository's Electron Playwright harness: Browser plugin not available. Core flow: offline app launch → own administrator setup/sign-in → directory/report/security interaction → persisted result or explicit permission denial, without runtime errors. Browser-only emulation cannot replace Electron IPC/native-output tests.

## Phase 7 closeout, 1 November 2026

The initial matrix remains above as the baseline. The following changes describe the delivered scope; unresolved feature/release gates are not reclassified as complete.

| Area | Final classification | Evidence |
| --- | --- | --- |
| Financial integrity/recovery verification | Fully implemented for fictional pilot scope | Deterministic varied corrections, preserved finalized rows, disk-full and abrupt-exit tests, fresh-profile restores at both scales |
| Performance evidence | Fully implemented for measured scope | Before/after service samples, actual Electron/PDF/paging/memory measurements; startup variance and synchronous main-process work remain limitations |
| Automated quality gates | Fully implemented for source verification | ESLint, 674-pair catalogue check, strict TypeScript, unit/service/security/migration tests, production build and real-Electron suite; installer separate |
| Controlled pilot materials | Fully implemented for source-based fictional evaluation | Separate checksum-verified demo dataset without accounts, launcher, staff/ML/backup/acceptance/rollback guides and issue template |
| English/Malayalam | Partially implemented / acceptance pending | Corrupted strings fixed; security errors/dialogs/statuses translated; offline embedded fonts and scaled screenshots verified. Some stored technical audit strings remain English; native-clerk sign-off still required |
| Financial report keyboard scrolling | Fully implemented | Named focusable scrolling region; load-suite axe scans passed |
| Ward creation, family-sheet print, imports | Missing | Explicit Phase 8 feature scope; no false end-to-end pass |
| Windows installer | Broken/unverified in this environment | Historical Device Guard/NSIS restriction unresolved; exact allowed-machine checklist supplied |
| Life events/finance/integrations | Mock/demo only | Same fictional gates and real local database behavior; live provider activation remains disabled |

| Issue | Disposition and next owner |
| --- | --- |
| P7-01 | Open: release owner must verify signed Windows installation/upgrade/uninstall on an allowed machine |
| P7-02 | Open: data custodian must approve local Windows protection/privacy/retention and independent recovery review before real records |
| P7-03 | Closed for fictional QA: reproducible 500/2,000-family fixtures and before/after reconciliation/restore evidence supplied |
| P7-04 | Closed for tested failure modes: ENOSPC safety backup and interrupted SQLite transaction preserve active/committed data; physical power-loss not certified |
| P7-05 | Closed for this optimization pass: bound equality filters, cached in-transaction plan/assignment reads, cheaper authorization refresh and one-pass outstanding grouping measured |
| P7-06 | Accepted limitation: existing 10/25-row paging remains stable; all report rows are still formatted. Larger workloads may need query paging/worker work |
| P7-07 | Closed: ESLint/hook gates added without downgrading TypeScript; behavior-preserving lint fixes verified |
| P7-08 | Fixed observed defects: unsaved role edits, corrupt Malayalam, unlocalized security statuses and nonfunctional Notifications role selector. Native language acceptance still open |
| P7-09 | Open: 25 moderate package findings after lint tooling, zero high/critical; compatible upstream remediation and export/build checks needed |
| P7-10 | Deferred: product owner to scope ward administration, family-sheet printing and imports |
| P7-11 | Closed for fictional source kit: staff checklist/training, ML guide, recovery/rollback, acceptance and issue-report materials supplied |
| P7-12 (new, P1) | Closed: financial scrolling region lacked keyboard focus; actual accessibility failure fixed and load suite passed |
| P7-13 (new, P1 pilot UX) | Open: fresh-process startup varied from 1–37 seconds across observations; engineering/staff must profile and accept representative-machine launch behavior |
| P7-14 (new, P2 test maintenance) | Closed: outdated activity-label expectation corrected; packaged test modernized but its runtime remains unverified |

Readiness: **CONDITIONAL** for a supervised fictional evaluation; **NOT READY** for real records. See [actual test results and changed files](PHASE-7-VERIFICATION.md), [all performance measurements](PHASE-7-PERFORMANCE.md), and [staff/manual release checklist](PHASE-7-PILOT.md).
