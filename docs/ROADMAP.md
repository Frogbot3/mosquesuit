# Milestone delivery and acceptance

Phases 0–5 are implemented through the fictional integration simulation and service foundation. [Phase 6 delivery](PHASE-6.md) defines the current security and recovery scope. The family sheet/import work remains planned. Independent security review and real provider activation remain release gates.

| Phase | Deliverable | Acceptance |
| --- | --- | --- |
| 0 | Repository inspection, architecture, requirements and risk register | Scope agreed in attached brief; no existing code overwritten; sensitive-data release gates recorded |
| 1 | Electron/React/Tailwind/SQLite foundation | Build, migration tests, typed IPC, persisted settings, offline real-Electron tests and Windows packaging |
| 2 | Family/member schema, registration, directories and profiles | Implemented: stable IDs, guardian FK/membership history, atomic saves, blank DOB/derived age, family ward/house history, duplicates, retained removal, Unicode and restart tests. |
| 3 | Marriage/divorce/death, separate transfers, event documents | Implemented in isolated fictional demo: confirmed transitions, history, deceased counts, guardian reassignment, transfers, attachments, bilingual PDF output and strict main-process restriction. Phase 6 staff and event permissions are enforced. |
| 4 | Financial management | Implemented in isolated fictional demo: integer paise, effective plans, dues, credits/refunds/reversals, receipts, funds, expense approvals, reports and consistent SQLite snapshots. See PHASE-4.md. |
| Deferred registration work | Printable family sheet, staged import and ward administration | Guardian-first sheet, preview/mapping/errors/duplicates/atomic rollback; still pending |
| 5 | Messaging/payment integration simulation and service foundation | Implemented: consent/templates, approved offline queue, retries, signed mocked webhooks, atomic ledger reconciliation, private receipt delivery and schedules. Provider activation and production pairing remain gated. See PHASE-5.md. |
| 6 | Staff security, audit and recovery | Implemented: Argon2id login, roles + ward scope, locks, account management, hash-chained audit, encrypted online snapshots and verified staged restore. See PHASE-6.md. |
| Release gate | Accessibility/localization/installer/pilot | Manual clerk review, real print/font checks, signed install/upgrade/uninstall on clean Windows, fictional 500-family load tests |

Security-sensitive schema/API design must accompany each phase. Phase 6 enforces access in IPC and services. Real sensitive records must wait for the remaining deployment and policy gates. The live accounting and privacy policies need administrator review before production use.

## Tests included now

Unit/component tests cover migration idempotency and tamper/future-version rejection, failed migration rollback, foreign keys, immutable activity, persistence, Unicode, input bounds, SQL parameters, atomic write+audit rollback, stale revision protection, development reset, sender/frame/origin checks, packaged reset denial, ward search, valid/invalid forms and failed-save feedback.

Electron tests cover strict runtime settings, narrow bridge/no Node in renderer, offline application reload and database use, main-process request validation, blocked popups, actual app restart persistence, Malayalam UI/input/font loading, settings errors, unsaved navigation, confirmed/cancelled reset, health checks, automated accessibility scans, theme persistence and desktop/compact layouts. A separate packaged executable smoke checks packaged native SQLite, offline load and forbidden reset.

Phase 2 adds tests for atomic household writes and rollback, guardian replacement, retained removal, duplicate numbers, foreign/archived member IDs, stale updates, DOB arithmetic, Unicode, deceased-count exclusion, ward/house history, non-destructive Phase 1 upgrades and complete Electron registration/restart/edit flows. See its delivery report for counts and accessibility results.

Phase 3 adds transition/chronology/duplicate tests, a populated Phase 2 upgrade, transfers and retained histories, attachment validation/persistence, demo-boundary rejection, complete Electron workflows, accessibility scans and actual bilingual PDF export. The PDFs were rendered and visually inspected. Current verification: 50 unit/component tests and 18 Electron tests passed; one packaged test skipped.

Phase 4 adds financial totals/idempotency, simulated permissions, historical fund guards, upgrade preservation, SQLite snapshot integrity, 500-household billing, UI payment/expense workflows and PDF/Excel/CSV export tests. See [Phase 4](PHASE-4.md) for current results. Tests for authenticated production role/ward permissions, messaging, encrypted restore, import rollback, physical printing and installer install/uninstall remain pending. A skipped packaged test is not a pass. The Phase 1 packaged attempt was blocked by Device Guard (exit 4551); NSIS failed launching its helper. Phase 3 did not retry or bypass that policy. No completed installer is delivered.

Phase 5 verification: 87 unit/component/service tests and 25 Electron tests passed; one packaged test skipped. Mocked messaging/payment integration is now implemented. Real provider activation, production permissions, paired encrypted recovery and a verified installer remain pending. See PHASE-5.md.

The preceding counts and pending items describe their original phase deliveries. Phase 6 now implements staff authorization and paired encrypted recovery: **111 unit/component/service tests and 29 Electron tests passed**, with one packaged test skipped. TypeScript and all production builds passed. See [Phase 6 verification](PHASE-6-VERIFICATION.md) for security/restore results and current release blockers.
