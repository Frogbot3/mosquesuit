# Administrator guide — registration, life events and finance demo

## Scope

Version 0.4.0 lets you evaluate family/member registration and separate fictional life-event and financial workspaces. Staff login, ward permissions, encrypted backup, restore and messaging remain unavailable. Life-event PDF/print output is marked as a fictional mosque administrative record. The dashboard family count reflects saved households. Contributions and financial reporting are available only in the separate finance demo.

## Run the preview

Use `npm run dev` from the project for evaluation. Windows x64 packaging scripts and an unpacked build are provided, but this machine's Device Guard policy blocked the packaged executable and NSIS generation failed while launching its generated helper. There is no completed installer to use from this build. Signing and clean-machine install/uninstall testing remain incomplete. The source preview works without internet once dependencies and Electron are downloaded. No account or external provider is needed.

The unpacked executable is the old Phase 1 artifact. To open the current built app, close the old window and run `npm.cmd start` in `C:\Users\Lenovo\Documents\mosqedatacollecting`. After source changes, run `npm.cmd run build` first. Restart an existing development process after main/preload changes.

For marriage/divorce/death workflows, run **`npm.cmd run demo:events`** instead. It opens the separate, initially empty `%APPDATA%\Mosque Suite Development\life-events-demo\` workspace. Create fictional families there first. Your ordinary registration workspace is not copied into it. Life-event operations are denied in ordinary and packaged workspaces because production permissions are not implemented.

See [Phase 3 opening instructions and manual walkthrough](PHASE-3.md) for marriage confirmation, administrative divorce, guardian death/reassignment, separate household transfers, attachments and bilingual PDF/print output.

The four initial wards have fictional names Ward 1–4. The profile starts as **Demo Mosque / മാതൃകാ പള്ളി**. The app does not seed real people or payment records.

## Financial management

Run **`npm.cmd run demo:finance`** for the separate fictional finance workspace. It starts empty and also supports life events. Create fictional families, then open Payments & Dues. See the complete [Phase 4 walkthrough and accounting rules](PHASE-4.md). Demo roles are selectable simulations; they do not authenticate staff. Consistent SQLite snapshots are available in Finance settings; encryption and a guided restore remain pending.

## Change the fictional mosque profile

1. Open Settings or choose Configure mosque on the dashboard.
2. Enter the English name (required); Malayalam name, address and contact are optional. Use fictional values.
3. Choose English/Malayalam and light/dark/follow-Windows appearance.
4. Save changes. A confirmation means the database transaction completed. Close and reopen the app to check persistence.

Discard changes returns to the last saved values. Navigation with unsaved fields asks whether to discard or keep editing. The top-bar language/theme controls are temporarily disabled while the settings form has unsaved changes. Invalid or stale changes are not silently accepted. If a save conflict occurs, reload saved settings and reapply the intended changes.

## Wards and activity

Wards supports English, Malayalam and ward-code search. No matches offers Clear search. The four wards are selectable when registering a family; editing a family's ward retains its previous ward/house assignment. Adding or renaming wards remains deferred. A separate confirmed household-transfer form is available in the life-event demo.

## Register and maintain a fictional household

1. Choose **Families → Add family**. Select Ward 1–4 and enter a family number unique within that ward.
2. Enter the house details you know. Leave unknown optional details blank.
3. The first member is the guardian. Enter their name in English or Malayalam and optional contact information. The guardian is the same saved member shown in the household list.
4. Choose **Add member** for each additional person. DOB is optional; age is calculated from it. Choose **Save family** to save the entire household together.
5. Open the family profile to see members, living/gender totals and history. **Edit Family** changes household details; each member's **Edit** opens their section. Saving updates the same record.
6. To replace a guardian, open another living member's details, choose **Set as guardian**, confirm, review everyone's relationships and save. Choose a replacement before removing the old guardian.
7. **Remove member** requires confirmation and takes effect on Save. Previously saved records remain accessible under the family's retained records and history.
8. Search Families by guardian, house name, family code (such as W1/001) or phone. Members has its own name/phone/family-code search. Both directories offer ward filters and page controls.

Navigation and closing the window prompt before discarding unsaved entries. Language/theme controls are disabled while a form is dirty. A conflicting save retains your draft; **Reload saved family** asks before replacing it. Family-sheet printing remains planned. The **Draft/Registered** label is chosen by staff; it is not a completeness or approval check. A confirmed life event manages the linked member's marital status; the family editor cannot override it. A death-confirmed guardian remains visible until you select a living replacement and save the family.

See [the Phase 2 manual verification sequence](PHASE-2.md#manual-verification) for a restart and duplicate-check walkthrough.

Audit History shows the latest 50 configuration events, using India Standard Time and a UTC stored timestamp. “Local preview · no staff account” is intentional. This history does not identify a real staff member and is not a financial audit. The database rejects audit row edits/deletions through normal application operations; a person with direct OS/file control can still tamper with it.

## Storage health

Settings → Check database runs SQLite quick-check and foreign-key checks. A pass means those database checks passed; it does not mean a backup exists, disk encryption is enabled or the computer is secure. Stop evaluation and preserve the workspace if storage checks fail. Do not delete/replace the database to clear a startup error.

Packaged data normally lives in `%APPDATA%\Mosque Suite\mosque-suite.sqlite3`. Development data lives under `%APPDATA%\Mosque Suite Development\workspace\`. These are separate. Database, WAL and SHM files may exist together. Never copy just the live SQLite file as a backup. For troubleshooting this fictional preview, close all app instances before preserving the **entire** userData folder; this is not the planned encrypted backup workflow. Do not move the live database onto OneDrive synchronization or a network shared folder.

## Development reset

Only the development build provides Reset demo settings. Save/discard pending edits first, then review the confirmation dialog. It restores the fictional mosque profile and preferences, increments the settings revision and appends an activity event. Family/member records and all history are preserved. Packaged builds hide and reject this operation.

## Recovery and production setup status

No backup archive creation, encryption key storage, USB backup scheduling, restore preview or restore execution is implemented. Version 0.3.0 adds schema migration 3 without deleting earlier settings, registrations or history. Event attachments are stored inside SQLite; settings reset preserves them and all event records. This is not approval for real-data deployment.

Before deployment with real records, the administrator and development team must finish and verify authentication/roles/ward scope, inactivity locking, authorized exports, data protection and retention policies, consistent encrypted backup of database + attachments, recovery-key custody, actual restore drills, upgrade/downgrade refusal, signed installer/update policy, and staff training on a realistic fictional dataset. A production setup guide can become operational only after these controls exist.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Browser says to open the desktop app | Use `npm run dev` or the installed executable; the browser has no database bridge. |
| Port 5173 is already used | Stop the other local service, then restart. The app does not silently trust another port. |
| Electron binary missing | After `npm ci`, run `node node_modules/electron/install.js` in the project. |
| Native SQLite problem | Run `npm run postinstall`; use the locked Windows x64 dependencies. Avoid arbitrary npm rebuild commands. |
| Database cannot be opened | Close duplicate processes, check local disk permissions/free space, preserve userData and seek support. No automatic replacement is performed. |
| Newer schema message/startup rejection | Use a compatible application version. Never edit migration checksums or delete the migration table. |
| Unsigned installer warning | This evaluation artifact lacks signing. Obtain an approved signed release before organizational rollout. |
| Packaged executable blocked by Device Guard | Use an organizationally approved signing/build/test process. Do not disable Windows protections. The development test result does not substitute for packaged verification. |

Uninstall is configured to preserve user data. Automatic updates and telemetry are absent. Any later remote integration must remain optional and explicitly configured.
