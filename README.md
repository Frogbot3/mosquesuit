# Mosque Suite

An offline-first Windows desktop workspace for mosque administration. **Version 0.7.0 adds repeatable quality gates, Malayalam and accessibility fixes, measured 500/2,000-family workloads, accounting/recovery drills and a fictional pilot kit. Use fictional information for evaluation; real-data deployment and live providers remain gated.**

## Open the Phase 7 fictional pilot

On this development computer, double-click **Open-Mosque-Pilot.cmd**. It opens a separate profile with four wards, 500 fictional families, 2,500 members and twelve months of dues. Create your own administrator and save the one-time recovery file separately. There is no default password, and existing profiles are not replaced.

For a copied source kit, install Node.js 24.18+ in the 24.x series, open PowerShell in the extracted folder and run:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run demo:pilot
```

Internet is required for initial dependency installation; the built pilot runs offline. The kit is not a standalone installer. See the [staff checklist and recovery guide](docs/PHASE-7-PILOT.md), [Malayalam quick start](docs/PHASE-7-QUICKSTART-ML.md), [readiness and test results](docs/PHASE-7-VERIFICATION.md), [completion matrix](docs/PHASE-7-AUDIT.md) and [performance report](docs/PHASE-7-PERFORMANCE.md). Pilot status: **CONDITIONAL for supervised fictional evaluation; NOT READY for real records**.

Phase 7 verification: **115 unit/component/service tests, 30 Electron scenarios and two load scenarios passed**. Lint, translation validation, TypeScript and production builds passed. **One packaged smoke test was skipped**; installer validation remains open. The final dependency audit has 25 moderate findings and no high/critical findings.

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
- ESLint, Vitest/Testing Library tests, real-Electron Playwright tests and Windows x64 NSIS packaging configuration (installer verification remains blocked).

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

Historical Phase 5 verification: **87 unit/component/service tests and 25 Electron tests passed**; **one packaged test skipped**. See the Phase 7 report above for current results.

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
npm run check         # Lint, translation catalogue, unit/service tests, build and Electron tests
npm run qa:benchmark  # Isolated 500/2,000-family measurements (use a fresh run label)
npm run qa:load       # Offline real-Electron load, PDF and scaled-layout tests after benchmark
npm run dist:win       # Build Windows x64 installer and unpacked application
npm run test:packaged  # Read-only smoke test of release/windows-preview/win-unpacked/Mosque Suite.exe
```

The packaging configuration is **unsigned**. On this machine, NSIS generation failed when launching its generated uninstaller helper (`spawn UNKNOWN`), and the packaged executable smoke test was explicitly blocked by Windows Device Guard (exit 4551). **No completed or verified installer is delivered.** The final unpacked artifact is under `release/windows-preview`; earlier partial builds remain elsewhere in `release`. `release/phase1/FAILED-uninstaller-generator.exe` is a failed build intermediate, not an installer. Do not distribute it.

Those installer artifacts are from **Phase 1**. Phase 7 updates the source and built assets and supplies a separate fictional source kit; it does not verify the old Windows package. Use `Open-Mosque-Pilot.cmd` for the current pilot. Restart an earlier development process to load updated main/preload code.

Code signing under your organization's approved trust policy and clean-machine deployment testing remain release gates. Do not disable Device Guard to run this preview. `npm run test:packaged` is a future runtime check on an approved machine; it does not install/uninstall NSIS or exercise Windows SmartScreen.

Historical Phase 4 verification: **66 unit/component tests and 22 Electron tests passed**. The normal suite still skips the separate packaged test; that is **not** a passing installer test. Exact allowed-machine installer checks are in the [Phase 7 pilot guide](docs/PHASE-7-PILOT.md#windows-installer-verification-on-an-allowed-machine).

## Data locations

| Mode | Directory (all under Electron userData) |
| --- | --- |
| Packaged preview | `%APPDATA%\Mosque Suite\` |
| Development / `npm start` | `%APPDATA%\Mosque Suite Development\workspace\` |
| Fictional life events / `npm run demo:events` | `%APPDATA%\Mosque Suite Development\life-events-demo\` |
| Fictional finance / `npm run demo:finance` | `%APPDATA%\Mosque Suite Development\finance-demo\` |
| Fictional integration / `npm run demo:integrations` | `%APPDATA%\Mosque Suite Development\integrations-demo\` |
| Staff security / `npm run demo:security` | `%APPDATA%\Mosque Suite Development\security-demo\` |
| Phase 7 pilot / `npm run demo:pilot` | `%APPDATA%\Mosque Suite Development\pilot-demo\` |
| Automated Electron tests | `%APPDATA%\Mosque Suite Development\test-<unique-id>\` |
| Packaged smoke test only | `%APPDATA%\Mosque Suite Package QA\test-<unique-id>\` |

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
