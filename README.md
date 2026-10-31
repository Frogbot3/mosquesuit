# Mosque Suite

An offline-first Windows desktop workspace for mosque administration. **Version 0.6.0 adds offline staff login, configurable roles and ward scope, audit history, encrypted backups and verified restore. Live messaging/payments remain disabled and production deployment checks remain open. Use fictional information for evaluation.**

## What works

- Electron desktop shell with React, TypeScript, Vite and the current Tailwind Vite plugin.
- Dashboard backed by local SQLite; four initial fictional wards; English and Malayalam ward search.
- Mosque profile, language and light/dark/system appearance saved in SQLite across restarts.
- English/Malayalam foundation UI, bundled Malayalam fonts, form validation, keyboard focus, unsaved-change confirmation, notifications and error states.
- SQLite WAL, foreign keys, strict tables, transactional/checksummed migrations, optimistic settings revisions and append-only configuration activity.
- Database quick-check and relationship check; development-only confirmed settings reset.
- Narrow validated IPC, sandboxed renderer, context isolation, blocked remote requests/navigation/downloads and packaged CSP.
- Searchable, paginated family/member directories with ward filters; household and member profiles; bilingual registration forms with a linked guardian.
- Atomic household saves, duplicate family-number protection, optimistic edit revisions, retained removed members, guardian changes, living/gender totals and registration/ward/house history.
- Vitest/Testing Library tests, Playwright tests of real Electron, and Windows x64 NSIS packaging.

- Isolated demo marriage/divorce/death registries, explicit member-status transitions, guardian reassignment flags, separately confirmed household transfers, attachment copies and bilingual PDF/native-print output.

Financial management, bilingual receipts, PDF/Excel/CSV reports, mocked messaging/payment workflows and their service foundation remain available. Phase 6 adds authenticated permissions, encrypted backup and restore. Family-sheet printing, imports, ward administration and real provider activation remain separate work. No Aadhaar field is provided. See [Phase 6 administration and recovery](docs/PHASE-6.md), [privacy review](docs/PHASE-6-PRIVACY.md), and [verification](docs/PHASE-6-VERIFICATION.md).

## Open Phase 6 staff security

Double-click **Open-Mosque-Security.cmd**, or run:

```powershell
npm.cmd run build
npm.cmd run demo:security
```

Create your own administrator account and save its one-time recovery file separately. The security demo uses a separate profile; all existing profiles require first-run administrator setup after upgrading too. There is no default password. **Staff & permissions**, **Audit history**, **Backup & restore** and **Account & security** are now active. See the [administrator guide](docs/PHASE-6.md).

## Open the Phase 5 integration demo

Double-click **Open-Mosque-Integrations.cmd** in this folder, or run:

```powershell
npm.cmd run build
npm.cmd run demo:integrations
```

This includes registration, life events, finance and Phase 5 in a separate fictional workspace. Start with **Notifications** or **Settings → Integrations**. It uses mocked providers: no real messages, money or public service. See the [walkthrough and service setup](docs/PHASE-5.md). This launcher is not an installer.

Verified: **87 unit/component/service tests and 25 Electron tests passed**, including earlier phases; **one packaged test skipped**. TypeScript, renderer, Electron and standalone-service builds passed.

## Open the finance demo

Double-click **Open-Mosque-Finance.cmd** in this folder to open the built finance demo. It is a launcher, not an installer.

Or in PowerShell, from this project folder:

```powershell
npm.cmd run build
npm.cmd run demo:finance
```

On later launches, only `npm.cmd run demo:finance` is needed. Create fictional families in this separate workspace first. Staff login and assigned permissions now control access; demo role impersonation is disabled. The old Phase 1 executable does not contain these features. See [the Phase 4 walkthrough](docs/PHASE-4.md) for payments, receipts, reports and backups.

## Requirements and first run

Develop on Windows 10/11 x64 with Node **24.18 or newer in the 24.x line** and npm 11. The checked-in lockfile pins compatible packages. Internet is needed to install dependencies and initially download Electron/installer tools; the built application works without it.

```powershell
npm ci
npm run postinstall
npm run dev
```

If your npm policy skips dependency installation scripts, the pinned Electron/esbuild scripts are listed in `package.json` under `allowScripts`. For a missing Electron download run `node node_modules/electron/install.js`. Do not globally enable arbitrary package scripts. SQLite 13 ships its Node-API binary; the postinstall script verifies it and a Malayalam round trip. A C++ toolchain is not needed on supported Windows x64.

`npm run dev` starts Vite on **127.0.0.1:5173** and Electron together. Renderer edits hot-reload. Restart this command after changing `electron/` or `shared/`. The browser URL alone intentionally cannot open the SQLite workspace. Stop with Ctrl+C or close the desktop window.

```powershell
npm run build          # TypeScript, renderer and main/preload bundles
npm start              # Run built assets without a dev server
npm run demo:events    # Open the separate fictional life-event workspace
npm test               # Unit, SQLite, IPC and React tests
npm run test:e2e       # Build + real Electron integration/accessibility tests
npm run dist:win       # Build Windows x64 installer and unpacked application
npm run test:packaged  # Read-only smoke test of release/windows-preview/win-unpacked/Mosque Suite.exe
```

The packaging configuration is **unsigned**. On this machine, NSIS generation failed when launching its generated uninstaller helper (`spawn UNKNOWN`), and the packaged executable smoke test was explicitly blocked by Windows Device Guard (exit 4551). **No completed or verified installer is delivered.** The final unpacked artifact is under `release/windows-preview`; earlier partial builds remain elsewhere in `release`. `release/phase1/FAILED-uninstaller-generator.exe` is a failed build intermediate, not an installer. Do not distribute it.

Those release artifacts are from **Phase 1**. Phase 4 updates the source and `dist`/`dist-electron` builds; it does not replace or verify the old Windows package. Close the previous desktop app, then run `npm.cmd run demo:finance` from this folder for the financial demo (including life events), or `npm.cmd start` for your existing registration workspace. Restart an earlier development process to load the new main/preload code.

Code signing under your organization's approved trust policy and clean-machine deployment testing remain release gates. Do not disable Device Guard to run this preview. `npm run test:packaged` is a future runtime check on an approved machine; it does not install/uninstall NSIS or exercise Windows SmartScreen.

Current verification: **66 unit/component tests and 22 Electron tests passed**, with TypeScript and the production build passing. Opening instructions, files and manual checks are recorded in [Phase 4 delivery](docs/PHASE-4.md). The normal suite skips the separate packaged test; that is **not** a passing installer test.

## Data locations

| Mode | Directory (all under Electron userData) |
| --- | --- |
| Packaged preview | `%APPDATA%\Mosque Suite\` |
| Development / `npm start` | `%APPDATA%\Mosque Suite Development\workspace\` |
| Fictional life events / `npm run demo:events` | `%APPDATA%\Mosque Suite Development\life-events-demo\` |
| Fictional finance / `npm run demo:finance` | `%APPDATA%\Mosque Suite Development\finance-demo\` |
| Automated Electron tests | `%APPDATA%\Mosque Suite Development\test-<unique-id>\` |

The database is `mosque-suite.sqlite3`. WAL/SHM sidecars are normal. Data is never placed in the source tree or installer. A single-instance lock protects one profile; this is not a multi-computer database. Do not place it on a shared network drive. The development reset changes only the fictional mosque profile/preferences and preserves registrations, events, attachments and history. The packaged preview has no reset capability. Additive migrations 2–4 preserve earlier data. Older code refuses the newer schema. Attachments are stored inside SQLite. Life-event/finance/integration modules remain isolated demonstrations pending production release checks. Phase 6 staff authorization applies to every workspace. Restore uses validated generations and an active-workspace pointer; see the recovery guide.

## Source map

```text
electron/
  main.ts                 Windows lifecycle, protocol, userData, security
  preload.ts              Forty-five named desktop bridge methods
  ipc.ts                  Sender validation + Zod request handlers
  life-events-ipc.ts      Demo-gated life-event handlers
  event-output.ts         Native file selection, PDF and printing
  security.ts             Document and packaged asset policies
  database/
    migrations.ts         Versioned, checksummed, transactional SQL
    store.ts              SQLite operations (main process only)
    registration-migration.ts  Additive schema version 2
    registration-store.ts  Atomic household operations and queries
    life-events-migration.ts  Additive schema version 3
    life-events-store.ts   Event transitions, transfers and documents
shared/contracts.ts       Typed requests, schemas and responses
shared/registration.ts    Registration validation, types and age calculation
shared/life-events.ts     Event validation, types and narrow API
shared/life-labels.ts     Bilingual event UI/output labels
src/
  components/             Layout, state provider, dialog and primitives
  pages/                  Foundation, registration and life-event workflows
  lib/                    IPC result handling and localization
  styles.css              Design tokens, Tailwind and responsive styles
scripts/                  Development, bundles, native check and packaging test
tests/unit/               Database, security, IPC and component tests
tests/e2e/                Real Electron and packaged executable tests
docs/                     Architecture, risks, administrator guide, roadmap
```

## Documentation

- [Phase 3 implementation, files, migration and manual verification](docs/PHASE-3.md)
- [Phase 4 financial management, accounting rules and manual verification](docs/PHASE-4.md)
- [Earlier Phase 2 delivery](docs/PHASE-2.md)
- [Phase 0 architecture, decisions and delivery gates](docs/ARCHITECTURE.md)
- [Requirements and risk register](docs/REQUIREMENTS-AND-RISKS.md)
- [Administrator guide and production prerequisites](docs/ADMINISTRATOR-GUIDE.md)
- [Milestone plan and acceptance scope](docs/ROADMAP.md)
- [Design system and reference](docs/DESIGN.md)

The remaining product is described in the roadmap. Family-sheet printing, staged imports and the other deferred modules require separate implementation. Real-data rollout waits for the remaining installer, dependency, privacy and operational release gates documented for Phase 6.
# mosquesuit
