# Phase 6 — staff security and recovery

Version 0.6.0, reviewed 31 October 2026. This release implements offline staff authentication, permissions, audit and encrypted recovery. Existing finance, life-event and integration demonstrations remain fictional. Live messaging and payment collection remain disabled.

## Open and set up

Double-click `Open-Mosque-Security.cmd`, or run `npm.cmd run build` followed by `npm.cmd run demo:security` from the project folder. This opens a separate `security-demo` workspace. Existing launchers keep their own workspaces and now require staff authentication too. The old Phase 1 installer does not contain Phase 6.

1. Create the first administrator with your own username, name and a 12–128 character password. There is no supplied administrator password.
2. Save the one-time recovery JSON file through the native dialog, preferably to separate protected removable storage. It is a password-reset credential: do not email it, commit it, or keep the only copy with the computer or its backups. The default save location is Documents, outside the project folder.
3. Sign in. Use **Account & security** to change your password, rotate the recovery file, and set the automatic lock interval (1–60 minutes; default 10).
4. **Lock screen** clears visible records and unsaved forms. Windows lock/suspend and inactivity also lock access. Sign out when another person takes over.

If the first recovery-file write fails after the account was created, sign in with the password you selected, then save a replacement recovery file under Account & security. Cancelling the initial file dialog creates no account.

## Staff and permissions

Use **Staff & permissions → Add staff account**. Choose a role and specific wards, enter a temporary password, re-enter your own current password and confirm. New/reset accounts must change their password before reading records. Staff names support Malayalam; usernames use 3–40 lowercase letters, digits, dot, underscore or hyphen. Disabling an account preserves its historical attribution. Editing grants or resetting a password revokes that account's sessions. The final active unrestricted Super Admin cannot be disabled or demoted.

| Role | Initial scope |
| --- | --- |
| Super Admin | All permissions, all wards; fixed role grants |
| Secretary / Admin | Registry, life events, finance configuration, routine accounting, reports, exports, notifications, backups and audit; no staff administration, restore, identity references, security settings or payment reversal |
| Accountant | Family/member and financial viewing, collection, donations, expense recording, reports, exports and notifications |
| Ward Operator | Family creation/editing and member viewing within assigned wards |
| Data Entry Operator | Family creation/editing and member viewing within assigned wards |
| Read Only | Family/member and financial viewing; no writes or exports |

**Backup authority is privileged:** an account with `backup.create` can obtain a complete database snapshot, including restricted records and password hashes. Grant it only to trusted custodians; remove it from any role that should not hold that authority.

A Super Admin can edit the five other role permission sets. Changes apply to all accounts with that role and revoke their sessions. Staff managers cannot grant permissions they lack or modify Super Admin accounts unless they are themselves Super Admins.

Ward scope is enforced on SQL directory/count queries and direct family/member access, including moves between wards. Global reports, life events, transfers, integration queues, audit, staff administration and backups require all-ward access; they fail closed for scoped staff. This release does not provide ward-filtered life-event administration. The old finance demo role impersonation API and unencrypted backup endpoint always deny access.

## Audit and sensitive information

**Audit history** filters by exact action, outcome and India date range, with 50 entries per page. Records include staff ID, timestamp, unique event and correlation IDs, entity, outcome, and a constant safe summary. Mutations and their audit inserts share a transaction where possible. Exports, attachment downloads and receipt output are recorded. Existing domain histories remain intact; the security history supplies staff attribution from Phase 6 onward.

Audit, login-attempt and backup-history rows reject ordinary update/delete operations. The audit viewer verifies a SHA-256 chain. This detects accidental or partial tampering; it is **not proof against a person with full Windows administrator/disk access**, who can alter code, remove triggers or replace/recompute the entire history. Keep independently stored encrypted backups for comparison.

No Aadhaar field has been added. New full twelve-digit identity-like document references are refused. Legacy death-document references are masked to their last four digits when an authorized viewer reads or exports them; users without `identity.view` receive an empty value and cannot overwrite the preserved reference through an ordinary edit. Viewing/exporting document attachments requires the event permission, `identity.view` and `data.export`. Attachments may contain information that cannot be automatically redacted: do not upload unneeded identity scans. Logs never include submitted passwords, recovery codes, provider credentials or full identity references. Free-text fields are not a substitute for an identity store.

## Create and schedule backups

1. Open **Backup & restore**. Enter a separate 12–128 character backup passphrase and your staff password.
2. Choose a local folder or mounted USB/external drive. Keep backups outside the active workspace. Enable a schedule if wanted; select 1–168 hours and retention of 1–100 verified archives.
3. Use **Create encrypted backup**. Leave the manual passphrase blank to use this Windows account's protected saved key, or supply the configured passphrase explicitly.
4. Confirm the history shows `verified`. Copy a verified archive to a second protected location and periodically rehearse restoration in a separate fictional workspace.

Schedules run only while the app is open, including while locked. A disabled owner or owner without backup permission cannot run them. Missed schedules run when the next timer check finds them due. Disconnected drives and other failures appear in history; they do not replace a valid backup. Retention removes only recognized, checksum-matching archives created by this workspace, never arbitrary files or restore safety archives.

Backup files use a versioned `MosqueSuite-<workspace>-<time>-<uuid>.msbackup` name. SQLite's online backup API snapshots the main database and the optional paired local integration service database. Attachments and logos are SQLite BLOBs and are included. A manifest records mosque identity, schema, date, filenames, byte counts and SHA-256 checksums.

Archives use AES-256-GCM with a fresh 96-bit IV, authenticated format/KDF header, and 128-bit tag. Argon2id derives a 256-bit key using a fresh 128-bit salt, 64 MiB, three passes and one lane. Keys/passphrases are never placed in the archive. The optional saved passphrase is sealed with Electron `safeStorage` (Windows DPAPI) outside the archive. A replacement computer needs the separately retained passphrase; copying the DPAPI file is not a recovery strategy. Maximum archive and total uncompressed database bytes: 256 MiB. Larger attachment collections need a future streaming/archive design.

## Restore and disaster recovery

1. Sign in with an account allowed to restore. On a replacement computer, first create a temporary administrator in a fresh workspace.
2. Choose **Restore verified backup**, enter its passphrase and select the archive.
3. Review mosque identity, backup date, schema and family/member/payment/staff/attachment counts. Current data remains active during preview. The preview expires after ten minutes or when the session locks/signs out.
4. Re-enter your current administrator password and type `RESTORE VERIFIED BACKUP`.
5. The app creates and verifies an encrypted safety backup of the current workspace, using the selected archive's passphrase. If this fails, restore stops.
6. The restored copies pass SQLite integrity/FK checks, migrations, audit-chain verification and active-administrator checks. A flushed, atomically renamed pointer activates the prepared generation, retaining the previous database files. The app restarts and revokes all restored sessions.
7. Sign in with an account **from the restored backup**, not the temporary administrator. Verify household/ledger totals and attachments. Reconfigure backup destination, passphrase and schedule: schedules are disabled and the saved local key is removed during restore.

Wrong passwords, modified authentication tags, malformed manifests, duplicate/unexpected file entries, checksum failures, missing required paired service data, future schemas and failed safety snapshots stop the restore before activation. This is a staged atomic pointer switch, not an in-place copy over a live SQLite database. Filesystem/hardware failures still require a tested recovery plan.

**Lost password:** On the sign-in screen choose the one-time recovery file and a new password. This consumes the file's credential; sign in and generate a replacement. Administrative resets also invalidate the previous recovery credential. Without a usable staff administrator or recovery file, there is no password bypass.

**Lost computer / failed drive:** Install the same or a compatible newer version, create a temporary administrator, and restore from a separately stored archive and passphrase. Then use an account contained in the archive. The archive includes the account recovery hashes as of its creation; a recovery file matching that backup can be used if necessary.

**Corrupt workspace that cannot open:** Close the application. Preserve the complete affected profile directory, including SQLite/WAL/SHM files and any active-generation pointer, under a clearly named quarantine folder. Have the administrator create a fresh profile at the original location, then use the normal first-run and restore workflow. Do not delete the damaged copy or try to copy individual live database files. A missing/wrong encryption passphrase cannot be recovered by support.

**Rollback after an activated restore:** Retain both the old generation and verified safety archive. Prefer restoring the safety archive through the normal wizard. An experienced administrator can recover the previous generation offline if the app cannot start; preserve both copies first. Do not edit the active pointer while the application is open.

Temporary decrypted snapshots/previews are created under the protected local profile and removed after normal completion/cancellation. A crash may leave staging data; an administrator must review orphan staging folders while the app is closed. File deletion cannot guarantee erasure from SSDs, journals, Windows paging or backups. Use Windows access controls, full-disk encryption and controlled disposal. The working SQLite databases themselves are not encrypted by this release.

## Architecture and changed files

| Area | Main files |
| --- | --- |
| Contracts, permissions, labels | `shared/security.ts`, `shared/security-labels.ts`, `shared/sensitive-data.ts`, `shared/contracts.ts` |
| Schema and enforcement | `electron/database/security-migration.ts`, `security-store.ts`, `authorized-services.ts`, `registration-store.ts`, `store.ts`, `migrations.ts` |
| Cryptography/recovery | `electron/security-crypto.ts`, `backup-service.ts`, `secure-files.ts`, `workspace-path.ts` |
| IPC and lifecycle | `electron/security-ipc.ts`, `ipc-authorization.ts`, existing IPC modules, `main.ts`, `preload.ts`, event/finance output |
| Interface | `src/components/SecurityProvider.tsx`, `src/pages/Security.tsx`, `src/lib/route-access.ts`, `src/security.css`, App/Layout and permission-aware existing screens |
| Verification | staff/security-controls/security-ipc/encrypted-backup tests, authenticated test fixtures, updated regression tests, `tests/e2e/staff-security.spec.ts` |
| Launch/dependencies/docs | `Open-Mosque-Security.cmd`, `scripts/start.mjs`, native/build scripts, package/lock files, README and Phase 6 reports |

Password hashing uses the pinned `@node-rs/argon2` Node-API native implementation because this Electron runtime does not support Node's built-in Argon2. No password hash, bearer session token, recovery code or saved backup key crosses the preload API. Sessions are process-bound random 256-bit credentials; only their hashes are persisted. Domain services independently authorize every call, and async work is tied to its initiating session. Five failed attempts per identity in 15 minutes (or 30 globally) throttle authentication; recovery and privileged reauthentication also have counters. Renderer activity can refresh a valid session, but cannot revive a locked one; native Windows idle state is checked as well.

## Verification and release limits

See [Phase 6 verification](PHASE-6-VERIFICATION.md) for final commands, counts and restore results, and [privacy review](PHASE-6-PRIVACY.md) for outstanding organizational duties.

Production release still requires a signed/clean-Windows installer and upgrade test (existing Device Guard/NSIS packaging failures have not been bypassed), review of the remaining dependency advisory, a Windows disk/access-control policy, Malayalam clerk review, and an independently supervised recovery drill. Do not use the outdated installer as evidence that this version was packaged. Real provider onboarding, hosted service operations, consent/retention policies and live payment/message release approval remain separate work.
