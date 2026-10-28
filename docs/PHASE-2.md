# Phase 2 delivery — family and member registration

Version **0.2.0**, verified on Windows on **25 October 2026**. This extends the existing Electron/React/TypeScript/SQLite application and its visual design. All test people and households are fictional. No real records were imported.

## Implemented

- **Families:** searchable table with family code, ward, house number/name, bilingual guardian, phone, living count, registration status and View/Edit actions. Search covers guardian names, house names, family number/code/permanent ID and guardian phone. Ward filters and 10/25/50-row pagination are backed by SQL.
- **Registration:** one form saves family details and all members together. Ward, family number and at least one guardian name are required. Every additional member needs a name in at least one language; unknown DOB and other optional information can remain blank. Family numbers are unique within their ward and case-insensitive, stored uppercase. Different wards can use the same number.
- **Members:** bilingual names, relationship, gender, DOB/derived age, parents, marital status, education, occupation, blood group, optional phone and remarks. No Aadhaar or other identity-number field is collected. A separate searchable directory and detail page support finding and editing people.
- **Guardian integrity:** the guardian is an actual member of that family, shown first. Changing the guardian requires confirmation; the old guardian cannot be removed until a current living replacement is selected. The operator reviews other relationships after a guardian change.
- **Safe editing:** client and main-process validation, optimistic family revisions, explicit duplicate/conflict messages, retained drafts after errors, confirmed removal, dirty-route confirmation and a native unsaved-close prompt. Failed aggregate writes roll back all family/member/history changes.
- **Family profile:** details, guardian contact, member table and links, living/gender counts, retained removed-member records, registration history and ward/house assignment history. Print Family Sheet is visibly marked **Planned**, without an inert print button.
- **Persistence and localization:** SQLite survives actual application restarts. English/Malayalam labels, Unicode input, local Malayalam fonts, light/dark appearances and compact desktop layouts use the established design system. The dashboard displays the real saved family count.

## Database migration

Migration **2 — `family_member_registration`** is appended to the existing checksummed migration chain. Migration 1 is unchanged. The migration is additive and transactional: existing mosque settings, wards and configuration activity are preserved. An upgrade test starts from a modified Phase 1 database and confirms those records survive.

| Table | Purpose and constraints |
| --- | --- |
| `families` | Stable UUID, ward foreign key, unique `(ward_id, family_number)` using NOCASE, household fields, status, revision and linked guardian |
| `members` | Stable UUID, family foreign key, registration fields, life status, retained archive timestamp; guardian-first retrieval |
| `household_memberships` | Relationship periods with one current membership per member; previous periods can only be closed, not rewritten or deleted |
| `family_assignments` | Ward/family-number/house-number periods with one current assignment per family |
| `registration_history` | Append-only registration actions, member references, changed field names and UTC timestamps |

Deferred foreign keys allow a family and its initial guardian to be created in one transaction. A composite guardian reference and SQLite triggers require a current living member of the same family; triggers also prevent archiving/deceasing the current guardian. Current-member, ward/number, name/phone and history indexes support reads. SQL values are parameterized; literal search escapes LIKE wildcard characters.

`saveFamily` uses an immediate transaction for family/member changes, membership periods, assignment periods and history. A removed saved member is archived rather than deleted. Names, DOB and contact changes are recorded as changed field names; full previous personal values are not copied into the event log. Assignment and relationship periods retain their own historical values.

The existing sender/frame/origin validation, sandbox and context isolation remain in place. Five narrow operations extend the four foundation methods: `listFamilies`, `getFamily`, `saveFamily`, `listMembers`, `getMember`. Each request uses a strict Zod schema. React receives no arbitrary SQL, filesystem access or unrestricted IPC capability.

## Files created

| Area | Files |
| --- | --- |
| Contracts and storage | `shared/registration.ts`; `electron/database/registration-migration.ts`; `electron/database/registration-store.ts` |
| Pages | `src/pages/Families.tsx`; `Members.tsx`; `FamilyEditor.tsx`; `FamilyProfile.tsx`; `MemberDetail.tsx` |
| Shared registration controls | `src/components/registration/RegistryShared.tsx`; `RegistrationFields.tsx`; `MemberEditor.tsx` |
| Hooks and labels | `src/lib/registration-i18n.ts`; `useRegistrationData.ts`; `useUnsavedRegistration.ts` |
| Tests | `tests/fixtures/registration.ts`; `tests/unit/registration.test.ts`; `tests/unit/registration-ui.test.tsx`; `tests/e2e/registration.spec.ts` |
| Delivery | `docs/PHASE-2.md` |

## Files modified

- `shared/contracts.ts`, `shared/channels.ts`: typed API operations, registry error codes and snapshot counts.
- `electron/database/migrations.ts`, `electron/database/store.ts`: attach migration 2 and the registration store.
- `electron/ipc.ts`, `electron/preload.ts`: expose the validated registration operations.
- `electron/main.ts`: native close prompt now refers to unsaved changes generally.
- `src/App.tsx`, `src/components/Layout.tsx`: family/member routes, active navigation and breadcrumbs.
- `src/pages/Dashboard.tsx`: persisted family count and current registry availability, preserving the existing layout.
- `src/styles.css`, `src/lib/i18n.ts`: registration styles, localized current-phase descriptions and ward-administration availability.
- `tests/unit/store.test.ts`, `ui.test.tsx`, `ipc.test.ts`: schema/API fixtures and registration boundary coverage.
- `tests/e2e/desktop.spec.ts`, `packaged.spec.ts`: expanded bridge/schema expectations.
- `package.json`, `package-lock.json`: 0.2.0 metadata; no dependency changes.
- `README.md`, `docs/ADMINISTRATOR-GUIDE.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `REQUIREMENTS-AND-RISKS.md`: current usage, scope, delivery and pointers to the original baseline.

`dist/` and `dist-electron/` were rebuilt. Existing Phase 1 artifacts under `release/` were not replaced.

## Verification results

Final command: **`npm.cmd run check` — passed**.

| Check | Final result |
| --- | --- |
| Vitest / Testing Library / SQLite / IPC | **36 passed, 0 failed**, across 6 files |
| TypeScript | **Passed**, no errors |
| Production renderer and main/preload build | **Passed** |
| Real Electron / Playwright | **12 passed, 0 failed**: 6 foundation regressions and 6 registration scenarios |
| Packaged executable smoke | **1 skipped**, requires an approved packaged executable; not counted as a pass |
| Automated accessibility | No WCAG 2 A/AA / 2.1 AA violations in the scanned foundation and registration screens, including the Malayalam/dark editor |
| Visual review | Inspected English form and Malayalam/dark compact form/profile screenshots; no page-width overflow at the tested desktop size |

The real Electron tests create a Ward 1 family through the UI, enter a guardian and three members, save to SQLite, close/reopen the app, edit a member, restart again and verify the saved edit. They exercise English/Malayalam/name/number/phone search, duplicate rejection, invalid IPC input, guardian replacement, retained removal, stale edits and reload confirmation, pagination, ward filtering and the native unsaved-close prompt. Offline operation is exercised after restart.

Storage tests additionally cover forced rollback on a history-write failure, guardian foreign keys, immutable history, foreign/archived/duplicate member IDs, family assignment history, partial Malayalam-only records, literal wildcard searches, deceased-count exclusion, leap-day/birthday age calculation and migration preservation. Tests use isolated in-memory/temporary databases and unique Electron test profiles; the user's development workspace is not seeded with fixtures.

Early test iterations caught incorrect revision expectations and a filter-label association; these were corrected before the final passing run. Screenshots are generated under `%TEMP%` as `mosque-suite-family-form.png`, `mosque-suite-registration-ml-dark.png` and `mosque-suite-family-profile.png`.

## Known limitations

- This is a registration preview. Staff authentication, roles/ward permissions, encryption and verified backup/restore remain unavailable; continue using fictional data.
- Print Family Sheet is planned. No marriage, divorce, death-entry, payments, messaging, import/export or other deferred module was implemented.
- Ward creation/renaming and transferring an individual between households have no UI/API in this phase. A whole family's ward/house reassignment is supported and recorded.
- A family supports up to 50 current members. Directories are paginated; approximately 500-family scale, concurrency on multiple computers and production recovery have not been benchmarked or qualified.
- Draft/Registered is an operator-selected label, not automatic completeness verification. Shared phone/name values are allowed; uniqueness is enforced for the family number within its ward.
- Registration history identifies local preview activity, not an authenticated staff member. It records changed field names, not a complete before/after personal-data snapshot. People with direct operating-system/database control are outside the protection provided by SQLite triggers.
- Automated accessibility checks and visual review do not replace a Malayalam-speaking clerk's usability review or manual screen-reader testing. No blank original paper form was supplied, so print fidelity was not evaluated.
- No Phase 2 Windows installer was produced. The old Phase 1 packaging attempt was blocked by Device Guard (exit 4551) and its NSIS helper failed to launch. This policy was not bypassed or retried. Use the built source application below; release signing and clean-machine installation remain separate work.

## Manual verification

Close any older Mosque Suite window/development process, then open PowerShell and run:

```powershell
cd C:\Users\Lenovo\Documents\mosqedatacollecting
npm.cmd start
```

The current source is already built. After future source changes, run `npm.cmd run build` before `npm.cmd start`. For active development use `npm.cmd run dev` and restart it after main/preload/shared changes. Opening the Vite URL in a normal browser does not provide the SQLite bridge.

1. Select **Families → Add family**, Ward 1 and an unused number such as `DEMO-001`.
2. Enter fictional English/Malayalam house names and the guardian's name. Optional contact numbers may remain blank.
3. Choose **Add member** three times. Give all three fictional names and relationships. Enter a DOB for one person and confirm the displayed age; leave another DOB blank.
4. Save. Confirm four living members and the expected gender totals on the family profile.
5. Close the app and run `npm.cmd start` again. Find `W1/DEMO-001`; confirm the names and four members remain.
6. Edit a member's occupation, save, restart and verify it on the member's detail page.
7. Search Families by guardian name, Malayalam house name and family number. Try ward filters and search Members by name.
8. Attempt another Ward 1 family with `DEMO-001` and a different fictional guardian. Confirm the duplicate error and that the original remains unchanged. Discard that draft.
9. Enter an invalid phone or future DOB. Confirm the validation message; valid saved data should remain unchanged.
10. Edit without saving and navigate away or close the window. Confirm **Keep editing** retains the draft. Then deliberately save or discard it.
11. In an edit, choose another living member as guardian; confirm, review relationships, save and inspect history. Remove a non-guardian, save and inspect their retained record.
12. Switch language and theme after saving, then open **Settings → Check database** and confirm schema 2 passes its integrity and foreign-key checks.

The application stores development records at `%APPDATA%\Mosque Suite Development\workspace\mosque-suite.sqlite3`. No database copying, deletion or manual migration is needed to open Phase 2.
