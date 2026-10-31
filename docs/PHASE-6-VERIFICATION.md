# Phase 6 verification and delivery

Version 0.6.0, verified 31 October 2026 on this Windows development computer. All test records were fictional and used isolated temporary profiles. Existing user profiles and recovery credentials were not used as test fixtures. Live messaging and payment collection remain disabled.

## Final results

| Check | Result |
| --- | --- |
| `npm.cmd run check` — unit, component and service tests | **111 passed**, 17 files; no failures |
| Same command — TypeScript and production builds | **Passed**: renderer, Electron main/preload and integration service |
| Same command — real Electron end-to-end tests | **29 passed**, no failures; **1 packaged test skipped** |
| Final copy corrections — `npm.cmd run build` | **Passed**, including TypeScript |
| Final English/Malayalam security-page accessibility and layout scenario | **1 passed** after the copy corrections; screenshots reviewed |
| Native SQLite and Argon2 verification | Passed using `node scripts/verify-native.mjs`; native hashing also exercised inside Electron |
| Dependency review | **20 moderate, 0 high, 0 critical** in the 31 October audit; unresolved production gate |
| Windows installer / clean-machine upgrade | **Not verified**; existing Device Guard/NSIS failure remains a blocker |

`npm.cmd run check` runs the unit suite, then a complete build and Playwright suite. End-to-end tests need Windows system utilities on PATH; this session appended `C:\Windows\System32` and `C:\Windows\System32\WindowsPowerShell\v1.0` for the test process only. The test catalogue contains 111 unit cases and 30 Electron cases, including the explicitly skipped packaged case.

An earlier full run found one obsolete test expectation: a read-only account previously saw a disabled payment form, while the new authorization boundary shows an access-denied page and omits the form entirely. The assertion was corrected to verify the denied route and missing input. A concurrent diagnostic run also exceeded the existing timeout for the 500-household billing fixture; the final full check ran without competing test workloads and passed. No known failing assertions remain. The skipped installer test is not counted as passed.

## Security coverage

- First-run administrator creation, duplicate bootstrap rejection, no automatic sign-in, correct/incorrect passwords, unique Argon2id salts and malformed credential rejection.
- Offline sign-in, persisted-session invalidation after restart, manual/native-idle locking, login throttling, disabled staff, forced password changes and one-time recovery-file consumption.
- Role and permission changes, password resets, current-password confirmation, revocation of existing sessions and protection of the last active unrestricted Super Admin.
- Server-owned ward filters for lists/counts and direct family/member requests; rejection of unauthorized ward moves, renderer-selected finance roles, payment reversals and staff administration.
- Rejection of untrusted windows/frames and malformed IPC fields, including attempts to supply SQL, paths, session tokens or effective roles. Domain services independently authorize requests.
- Async operations remain tied to the initiating session. An operation cannot continue a database write under a different account after sign-out/sign-in.
- Audit persistence across restarts, append-only triggers, chain-integrity checks and transactional rollback when an audit append fails. Domain audit summaries omit submitted free-text values; legacy summaries are redacted on reading without rewriting stored history.
- Legacy identity references are masked/restricted, existing stored values are preserved during an ordinary restricted edit, and new full twelve-digit identity-like references are refused. Exports and attachment access require explicit permissions.
- Existing context isolation, renderer sandbox, disabled Node integration, local asset/CSP policies, blocked popups, strict sender/origin checks and narrow preload bridge remain covered by regression tests.

## Encrypted backup and restore results

The backup service tests cover fresh encryption salts/IVs, authenticated archive verification, wrong passwords, modified/corrupt archives, incompatible schema versions and authenticated manifests with incorrect file checksums. Failed verification leaves the active database unchanged.

A real restore test preserved fictional household records and a document attachment BLOB, created and verified an encrypted safety archive, activated the prepared database generation and confirmed SQLite integrity and foreign keys. The previous database files remained available. Another fixture backed up and previewed **500 fictional families and 2,000 members**. Schedule/retention tests verified execution while signed out, authorization of the schedule owner, retention of unrelated files, and recovery from destination failures without leaving the application frozen.

The Electron restore scenario exercised the actual UI and native file-dialog integration: create an encrypted archive containing one family, add a second family, reject an incorrect passphrase, preview the one-family archive while two families remain active, enter the required restore confirmation, and create the safety copy. The harness observed the authorized relaunch request, closed its own process and launched a fresh app against the restored profile. After sign-in, the restored workspace contained one family, reported schema 6, passed integrity and foreign-key checks, and contained a valid `backup.restored` audit entry. Both the selected archive and the new safety archive existed. Only native dialog selection and the process-relaunch trigger were controlled by the harness; the backup encryption, staging, validation, activation and restarted database were real.

Paired local integration-service databases are included when configured. This does not constitute a disaster-recovery test of a hosted production provider service, which is outside this phase.

## Interface and regression review

The four new Electron scenarios cover first-run setup/offline login/locking, staff creation and forced password change with ward restrictions, encrypted restore across a real app restart, and seven security pages in English/Malayalam. Automated WCAG A/AA scans passed. Light/dark and compact layouts were checked, including contained horizontal scrolling for the staff table. Screenshots are retained locally under `tmp/security-review/`.

The screenshot review caught old pre-authentication banners in shared English/Malayalam labels. Those labels and obsolete backup/history guidance were updated, followed by a fresh production build and a repeat of the security-page accessibility/layout scenario. A fluent Malayalam clerk review remains necessary before deployment.

Existing registration, member/guardian changes, life events, household transfers, attachments, financial ledger invariants, dues for 500 households, receipts, PDF/CSV/XLSX exports, mocked messaging/payment reconciliation, unsaved edits, offline persistence and restart behavior passed their regression suites. No live providers were contacted by these scenarios.

## Gaps found and addressed

Initial inspection found records accessible without staff login, selectable finance demo roles, audit histories without authenticated actors, an unencrypted SQLite snapshot without a restore workflow, and no ward-based authorization. Phase 6 adds enforced service/IPC authorization, removes role impersonation, denies the old unencrypted backup endpoint, and supplies authenticated audit and encrypted staged recovery. The original modules and stored records are retained.

During implementation, the Electron runtime rejected Node's built-in Argon2 implementation despite it working in host Node. Password and archive key derivation now use the pinned `@node-rs/argon2` native implementation, tested in the actual Electron runtime. Migration 6 uses frozen seed definitions to keep its checksum stable; already-applied migration metadata was checked read-only and matched. Windows pointer-file flushing was corrected to use a writable handle before atomic activation.

Changed-file groups and architecture are listed in [the administrator guide](PHASE-6.md#architecture-and-changed-files). The prioritized inspection plan is in [PHASE-6-PLAN.md](PHASE-6-PLAN.md). The launch entry point is `Open-Mosque-Security.cmd`; it opens the separate fictional `security-demo` profile and asks the user to create their own administrator.

## Remaining production blockers and limits

- A signed, working installer and installation/upgrade/uninstall checks on clean Windows are outstanding. The previous executable was blocked by Device Guard (exit 4551), and NSIS could not launch its helper. These policies were not bypassed; the old installer does not contain Phase 6.
- Resolve the current minimatch dependency advisory with compatible upstream updates and packaging/export regression checks. No forced major override or dependency downgrade was applied. See [dependency review](PHASE-6-PRIVACY.md#dependency-review).
- Approve Windows account permissions, full-disk encryption and secure disposal. Working SQLite databases are not encrypted; a Windows administrator can read or alter them and replace/recompute audit history. The hash chain is not protection against full administrator control.
- Backup authority grants access to a complete database snapshot. Restrict it to trusted custodians. Retain the archive passphrase separately; Windows DPAPI storage alone does not recover data on a replacement computer.
- Approve retention of exports, archives, orphan staging folders after crashes and old restore generations. Deleting files cannot guarantee erasure from SSDs, paging files or external backups. Archives and total database snapshots are bounded to 256 MiB.
- Complete an independently supervised recovery drill, Malayalam clerk review, privacy notices/legal-basis/retention and incident procedures. See the [Indian privacy review](PHASE-6-PRIVACY.md).
- Ward-scoped staff can use the scoped registry; global life-event, reporting, integration and administrative operations require all-ward access. Ward-filtered versions of those global modules are outside this delivery.
- Live provider onboarding, payment/message release approval and hosted-service operations remain separate work. Phase 6 does not activate them.
