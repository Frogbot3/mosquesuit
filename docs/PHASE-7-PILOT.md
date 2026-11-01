# Phase 7 staff pilot guide

This guide is for **supervised evaluation using fictional records only**. The project is not approved for importing real mosque records or activating providers. Final test and performance results are recorded in the Phase 7 readiness report. The evaluation kit is a source-based Windows application, not a verified Windows installer.

## Open the fictional pilot

On this development computer, double-click `Open-Mosque-Pilot.cmd`. The separate `pilot-demo` profile starts with four wards, 500 fictional families, 2,500 members, twelve months of dues, 2,000 payments, sample events and pending notifications. No administrator account or shared password is included. Create your own administrator and save the one-time recovery file separately.

For a copied evaluation kit on an allowed Windows machine:

1. Extract the whole kit into a folder where you have write access. Install Node.js 24.18 or newer within the 24.x series.
2. With internet available for initial dependency installation, run `npm.cmd ci`, then `npm.cmd run build` from that folder. This installs the pinned application dependencies; it does not import any real records.
3. Double-click `Open-Mosque-Pilot.cmd`. Subsequent application use can be offline. The launcher verifies the supplied fictional database checksum and copies it only into a new pilot profile.
4. Create your own administrator, save the recovery file, then sign in. The launcher never replaces an existing pilot database or restored generation. An incomplete existing profile must be reviewed by the administrator, not reset automatically.

The profile is `%APPDATA%\Mosque Suite Development\pilot-demo`. Other development/demo profiles remain separate. Keep the project/kit folder available: this launcher depends on its built files and dependencies. The old Phase 1 installer does not contain Phase 7.

## Suggested staff training session

Allow 60–90 minutes with one administrator, one clerk and an observer. Use a second protected drive for test backups. Record the exact app version, Windows display scaling, test case and outcome. Mark a step blocked when its prerequisites are missing; do not convert it to a pass.

| Task | Steps | Expected result |
| --- | --- | --- |
| Sign in and lock | Create an individual account, sign in, use Lock screen, sign in again | Records disappear on lock; password required to continue |
| Find a family | Search English/Malayalam house or guardian name, filter a ward, change page | Correct matching records; paging stays within selected filter |
| Register a family | Choose an existing ward; add guardian and four fictional members; save; close and reopen app | Same family, guardian and members persist |
| Edit and transfer | Edit address; move a non-guardian through Household transfer with confirmation | New household membership and both histories are preserved |
| Missing family steps | Attempt ward creation and family-sheet printing | These are planned features; record **blocked**, not passed |
| Life events | Register/confirm a marriage; review/confirm related divorce; confirm a sample death | Existing history remains; living count changes; guardian death raises reassignment warning |
| Financial collection | Assign monthly plan; generate dues twice; pay part then remainder; open receipt | No duplicate dues; correct balance and unique receipt numbers |
| Financial correction | Authorized administrator reverses a fictional payment; record donation and approved expense | Separate audited correction; original transaction retained; fund/report totals reconcile |
| Reports and output | Select dates; compare monthly/fund/ledger totals; save PDF/CSV/XLSX; inspect print preview | Scope/totals agree; bilingual output is readable and files open |
| Permissions | Sign in as Ward Operator limited to Ward 2; try Ward 3 and finance/staff actions | Ward 3 and unauthorized actions are denied at UI and data service |
| Notifications | Review fictional consent and offline queue; use mock responses only | No real send; offline jobs remain pending/approval; failed/uncertain delivery is explicit |
| Backup and restore | Follow the rehearsal below | Reopened records, attachments, financial totals and audit agree |
| Close with edits | Edit a permission or family field and navigate/change role/close | Clear keep/discard choice; keeping preserves the unsaved form |

## Backup rehearsal and rollback

1. Sign in as an authorized backup custodian. Choose a protected external folder, a separate strong backup passphrase and the desired retention. Keep the passphrase outside the archive and separately from the computer.
2. Create a backup; confirm its history says **Verified**. Record fictional family/member counts, an attachment and financial totals. Copy the archive to a second protected location.
3. In a separate fictional profile, create a temporary administrator. Select the archive and enter its passphrase. Compare the preview counts, date and mosque identity.
4. Confirm restore only after reviewing the replacement warning. Enter the current account password and the exact displayed confirmation text. The application creates a verified safety backup before activation.
5. After restart, use an administrator account **contained in the restored archive**. Check the same family/member, PDF attachment, monthly/fund totals and audit history. Reconfigure backup destination/schedule because restored schedules are disabled.
6. To roll back, restore the verified safety archive using the same workflow. Keep both prior profiles/generations and archives until the observer signs off. Never overwrite individual live SQLite files.

If the app cannot open, close all copies and preserve the entire affected profile, including WAL/SHM files and the active-generation pointer. An administrator should quarantine a complete copy, create a fresh profile, and restore normally. Do not delete damaged files or edit the active pointer while the app is open. See [Phase 6 recovery](PHASE-6.md#restore-and-disaster-recovery).

If a drive is full or disconnected, stop the backup/restore attempt and review its failed history entry. Free space or choose another protected drive, then retry. Failed safety backup must leave current data active. Do not deliberately fill the computer's system drive for a pilot test; automated fault-injection covers that failure mode.

## Acceptance checklist

- [ ] All participants used individual accounts and understood lock/sign-out.
- [ ] Ward restrictions and finance/staff/export permissions were checked with a separate clerk account.
- [ ] Registration, events and manual accounting persisted after restart while offline.
- [ ] Duplicate dues/payments were rejected; corrections remained separate and auditable.
- [ ] Monthly, daily, fund and ledger totals agreed for the selected scope.
- [ ] Encrypted archive and recovery-file custody were demonstrated; restore on another fictional profile matched records, attachments and totals.
- [ ] English/Malayalam labels, fonts, keyboard navigation and displays at 100%, 125% and 150% were reviewed by staff.
- [ ] Native print dialog and a physical A4/A5 print were manually checked on the actual target printer. Automated PDF output does not certify a printer.
- [ ] Missing ward creation, family-sheet print and imports were accepted as explicit limitations or recorded as blockers.
- [ ] All remaining issues have an owner; no unresolved critical/high-severity defect or unexplained accounting difference was accepted.

Real-data approval additionally requires a verified signed installer/upgrade, resolution or formal acceptance of dependency findings, Windows access controls/full-disk encryption, privacy/retention/incident procedures, a Malayalam-speaking clerk review and an independently supervised recovery drill. Offline storage does not remove those duties. Live messaging/payment onboarding remains separate work.

## Windows installer verification on an allowed machine

The current development environment previously blocked execution with Device Guard exit 4551 and failed NSIS helper startup. Do not disable Windows policy or bypass that restriction. On an approved clean Windows VM/user account:

1. Install dependencies and run `npm.cmd run check`.
2. Run `npm.cmd run pack:win`, then `npm.cmd run test:packaged`. The smoke test uses its own UUID-named QA profile and authenticates normally; production feature/authorization gates remain enabled.
3. Run `npm.cmd run dist:win` with the release signing configuration supplied by the owner. Verify publisher/signature and installer checksums.
4. Install as a normal Windows user, create a fictional administrator, register a family, back up and close. Install the next signed build over it; verify retained data, migration checksums, native SQLite/Argon2, offline login, outputs and restore.
5. Uninstall; verify retained user data and reinstall/restore. Check Windows Defender/enterprise policy logs, shortcuts, fonts, printer dialogs and screen scaling. Record actual results and artifacts. A build or skipped smoke test is not an installer pass.

## Report an issue

Use [the issue template](PHASE-7-ISSUE-TEMPLATE.md). Include fictional reproduction steps and expected/actual behavior. Do not attach real personal records, account/backup passwords, recovery JSON files, provider tokens or unrestricted database dumps. Redact screenshots before sharing them.
