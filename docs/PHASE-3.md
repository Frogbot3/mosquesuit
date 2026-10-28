# Phase 3 — life events delivery

Version **0.3.0**, 26 October 2026. Marriage, divorce and death registries extend the existing Electron/React/TypeScript/SQLite application. Family/member registration and the existing workspace remain available.

## Open the software

From PowerShell:

```powershell
cd C:\Users\Lenovo\Documents\mosqedatacollecting
npm.cmd run demo:events
```

The current source has already been built. After changing source files, run `npm.cmd run build` before opening it. On a fresh checkout, install the locked dependencies with `npm.cmd ci` first. Node 24.18+ in the 24.x line and npm 11 are the tested prerequisites.

`demo:events` opens a **separate, initially empty fictional workspace**. Create fictional families and members there before trying the registries. Close an earlier window for this profile before restarting so new main/preload code loads. No browser URL or cloud account is needed.

Use `npm.cmd start` to reopen the ordinary Phase 2 workspace. Its existing registrations are kept; life-event actions are unavailable there.

| Workspace | Location |
| --- | --- |
| Ordinary development workspace | `%APPDATA%\Mosque Suite Development\workspace\` |
| Life-event demonstration | `%APPDATA%\Mosque Suite Development\life-events-demo\` |
| Automated tests | Separate `test-<UUID>` folders, removed after each test |

There is **no new Windows installer**. Existing files in `release` are old Phase 1 artifacts. Their earlier Device Guard/NSIS failures remain unresolved; this phase did not retry or bypass that policy.

## Implemented behavior

### Marriage

- Searchable, paginated registry with status and inclusive date filters, details and editing.
- Unique registration number within the marriage registry; marriage and registration dates; linked groom/bride or external-party details; guardian information, witnesses, officiant/Qazi, venue, optional mahr and administrative remarks.
- Existing members are referenced by stable ID. External parties have their own minimal record; they are not silently added to a household.
- An explicit confirmation creates the marriage link and updates linked living members' marital status. Saving a reported record alone does not change their status.
- Marriage does not move anyone. Household transfer is a separate form and confirmation.

### Divorce

- Searchable registry, details, editing and configurable English/Malayalam category names. Categories can be deactivated without deleting existing references.
- An optional associated marriage supplies its parties. Standalone records can reference existing members or external parties.
- Administrative states: reported, under review, confirmed and closed. Confirmation updates linked living members and ends the associated active marriage link; it retains the original marriage and all records. Closing follows confirmation.
- These are administrative records. The software makes no legal or religious determination.

### Death

- Unique record number, member reference, event/registration dates, optional place, burial date/location, informant/contact, document references and remarks.
- Explicit confirmation marks the member deceased, retains their record and changes derived living totals.
- A deceased guardian flags their current household for reassignment. The family profile shows the warning; selecting a living replacement through the existing family editor clears it on save.
- Duplicate death registrations and impossible chronology are rejected. Death does not delete members or financial history. No dues engine exists yet; a future dues policy must use life status explicitly. Survivor marital status is not automatically inferred.

### Transfer, documents and history

- A living non-guardian can be moved between households after confirming the source, destination, relationship and reason. Guardians require a replacement first. Both household revisions are checked, both totals update, and membership periods and transfer history are retained.
- PDF, PNG and JPEG supporting files are selected through a native picker: up to 10 MB each and ten per record. Type signatures are checked and a copy is stored inside SQLite. Stored copies survive restart and can be saved through a native destination picker. Files are not automatically opened.
- Event creation, edits, status changes and attachments are recorded in append-only history. Changed field names are recorded, rather than a complete before/after snapshot. The actor is explicitly a local fictional-demo actor, not an authenticated staff member.
- Bilingual mosque-issued administrative records can be saved as PDF or sent to a native print dialog. Local Malayalam fonts, escaped text, page numbers and fictional-demo markings are included. Empty optional print fields are omitted. Death output explicitly states that it is not a government certificate.

## Database migration

Migration **3: `life_events_demo`** is appended to migrations 1 and 2; their SQL/checksums are unchanged. It runs transactionally and preserves the earlier settings, wards, registrations and histories.

| Addition | Purpose |
| --- | --- |
| `families.needs_guardian` | Flags a household after guardian death; defaults to false |
| `life_events` | Common kind, number, dates, status and revision |
| `marriages`, `divorces`, `deaths` | Event-specific fields and references |
| `external_parties`, `event_participants` | Minimal external-party data and member/household references |
| `marriage_participants` view, `marriage_links` | Participant lookup and confirmed relationship periods |
| `divorce_categories` | Configurable categories with neutral demo defaults |
| `event_documents` | Bounded immutable attachment copies |
| `event_audit_history` | Append-only event/category audit records |
| `household_membership_history` | Append-only transfer ledger alongside existing membership periods |

Indexes support registry/date/status and participant/history queries. Constraints protect unique numbers, associated-marriage cases, death-member uniqueness and foreign keys. Guardian triggers allow a deceased guardian only with the reassignment flag; clearing the flag requires a living guardian. Application transactions check chronology, stale revisions and valid transitions before applying member/family changes.

Family references captured when an event is recorded remain stable after a transfer. Names and household labels are resolved from referenced records; printed output is not an immutable snapshot of every historical profile field.

## Security boundary and limitations

Authentication and production roles/ward permissions are **not implemented**. Accordingly, every life-event read/write/export/transfer operation is denied outside the isolated development demo or a uniquely named automated-test profile. The restriction is enforced in main-process IPC and the store, not just hidden buttons. Packaged builds ignore the demo flag. This is a demonstration boundary, not a substitute for staff authorization or OS-level data protection.

The preload exposes 20 named methods in total. New handlers validate sender/frame/origin and strict Zod payloads; renderer-provided roles, arbitrary filesystem paths and unknown fields are rejected. SQL stays in the main process, file reads are capped, and print windows are sandboxed without a preload or Node access.

Confirmed identity/date fields are locked. Descriptive corrections remain editable with history. There is no reversal, voiding or document-deletion workflow yet. The database is not encrypted, backups/restores and production retention policies are pending, and an OS user with direct file access can tamper with local files. Do not enter real sensitive records.

Physical printing, native dialog usability with a human operator, manual Malayalam clerk review, production authorization and a signed installer require further verification. Payment, WhatsApp, import and family-sheet printing were not added in this phase.

## Files

New implementation files:

- `shared/life-events.ts`, `shared/life-labels.ts`
- `electron/database/life-events-migration.ts`, `electron/database/life-events-store.ts`
- `electron/life-events-ipc.ts`, `electron/event-output.ts`
- `src/components/life-events/LifeShared.tsx`
- `src/pages/LifeEvents.tsx`, `LifeEventEditor.tsx`, `LifeEventDetail.tsx`, `HouseholdTransfer.tsx`, `EventCategories.tsx`
- `tests/fixtures/life-api.ts`, `tests/unit/life-events.test.ts`, `tests/unit/life-events-ipc.test.ts`, `tests/e2e/life-events.spec.ts`

Updated integration files:

- `shared/contracts.ts`, `shared/channels.ts`, `shared/registration.ts`
- `electron/main.ts`, `electron/preload.ts`, `electron/ipc.ts`, `electron/database/migrations.ts`, `store.ts`, `registration-store.ts`
- `src/App.tsx`, `src/components/Layout.tsx`, `src/pages/Families.tsx`, `FamilyProfile.tsx`, `src/lib/registration-i18n.ts`, `src/styles.css`
- `scripts/start.mjs`, `package.json`, `package-lock.json`
- Existing unit/component and Electron tests updated for schema 3, version 0.3 and the narrow extended bridge.
- This report, README, administrator guide, roadmap and requirements/risk pointers.

## Verification

`npm.cmd run check` runs unit/component tests, TypeScript checking, production renderer/main/preload builds and the real-Electron suite. Current result: **50 unit/component tests passed; 18 Electron tests passed; one packaged-executable test skipped**. The skipped test is not an installer pass.

Coverage includes Phase 1/2 regressions, an actual populated Phase 2 database upgrade, Unicode persistence, duplicates, invalid dates and chronology, stale writes, atomic rollback, explicit marriage/divorce/death transitions, deceased totals and guardian reassignment, transfers and retained histories, attachment validation, normal-workspace denial, forged roles/paths and sender/frame rejection.

Electron tests exercise existing and external spouses, divorce review/confirmation, guardian death, a separately confirmed transfer, invalid/dirty forms, category editing, restarts, actual Chromium PDF output and attachment persistence. Native file-picker results are controlled by the test; PDF creation and database reads/writes are real. New screens pass automated WCAG A/AA checks, including the Malayalam compact dark view, with no viewport overflow or renderer errors. These checks do not replace manual accessibility review.

All pages of the three sample PDFs were rendered and visually inspected for layout and Malayalam shaping. The final sample marriage, divorce and death records each fit one A4 page. Longer populated records can span multiple numbered pages. The Malayalam dark desktop detail screen was also visually inspected.

## Manual verification

1. Open `demo:events`. Confirm the fictional-demo banner. Create two fictional families with different family numbers, each with a guardian and another living adult. Use a Malayalam name on at least one member.
2. Open Marriage Registry → Add new record. Select members in different families, use `DEMO-M1`, enter valid dates, and save. Check that household membership and marital status have not changed. Confirm the record; check marital status and unchanged households. Try another record with an external spouse.
3. Edit remarks and reopen the record to inspect history. Try a duplicate number, a future date, a date before a known DOB and navigation with unsaved changes. Invalid saves must keep the draft. Confirmed identity/date fields should be locked.
4. Open Divorce Registry, select the associated marriage, enter `DEMO-D1` and a date on/after marriage, and save. Mark under review, confirm and close. Check updated member status and that the original marriage remains accessible. Add a fictional category in Categories and use it on another record.
5. Use Household transfer for a living non-guardian. Select the other household, relationship and reason; inspect the confirmation before accepting. Open both family profiles and check counts and transfer history. A guardian transfer should be refused until a living replacement is chosen.
6. Create a death record for a fictional guardian and confirm. Check the retained member, lower living count and reassignment warning. Edit the family, select another living member as guardian, save and check the cleared warning. A second death record for that member must fail.
7. Attach a small fictional PDF or image, restart, and save a copy. Export each kind as PDF and inspect English/Malayalam names, record number, dates, page numbers and demo/administrative wording. Try Print with an approved printer if available; no physical print test was performed during delivery.
8. Switch English/Malayalam and light/dark appearance; search by member name and number, use date/status filters and page through records. Reopen the ordinary workspace with `npm.cmd start`: earlier Phase 2 registrations should remain there, and life-event actions should be restricted.

The demo is persistent. Settings reset preserves registrations, events, attachment copies and histories; it is not an erase-demo command.
