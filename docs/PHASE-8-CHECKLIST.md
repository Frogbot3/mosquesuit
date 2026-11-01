# Phase 8 prioritized production release checklist

Started 1 November 2026 against Phase 7 version 0.7.0. Initial production status: **BLOCKED**. Existing fictional pilot profiles and their staff credentials must remain unchanged; no default account will enter a distributable.

| Priority | Work and acceptance | Initial finding |
| --- | --- | --- |
| P0 | Preserve release identity, userData and migration checks; stop on missing/corrupt existing storage; test future-schema and failed-upgrade recovery | Schemas 1–6 are checksummed; production initialization and missing-file protection need strengthening |
| P0 | Review dependency advisories; no unresolved critical/high findings in candidate | Phase 7 has 25 moderate, zero high/critical; refresh audit before release |
| P0 | Separate signed production, unsigned testing and demo artifacts; verify packaged native modules; never bypass OS policy | NSIS exists; historical Device Guard 4551/helper execution failure; no verified installer |
| P0 | Require production publisher, signing certificate and trusted update origin; keep downloads/installation disabled without trust | Owner details requested; no signing credentials or release origin provided |
| P1 | First-run identity/ward/finance/language setup, administrator creation, later authorized edits | Staff bootstrap exists; product configuration wizard and ward editing missing |
| P1 | Bounded CSV/XLSX selection, mapping, row validation, explicit duplicate rejection, preview/cancel, pre-import encrypted backup and atomic audited commit | Imports missing; no opening-balance format approved, so financial opening balances excluded |
| P1 | About/update status, authenticated release metadata, offline license verification foundation, redacted diagnostic export | Missing; no unattended updates or license-driven data lockout permitted |
| P1 | Branded family-sheet preview/PDF and existing receipts/event/report checks | Family-sheet output missing; existing demo outputs work; physical printer not verified |
| P1 | Test new workflows, authorization, failed imports, recovery, initialization, signed-metadata tampering and source quality gates | Existing baseline: 115 unit/service + 30 Electron + two load passes; one packaged skip |
| P1 | Clean Windows 11/10 install/upgrade/uninstall/reinstall and physical printer | External machines/printer not yet available; record pending, never infer a pass |
| P1 | Privacy commencement-date review, staff EN/ML guides, daily checklist, release notes, support/rollout/rollback and owner sign-off | Earlier guides exist; Phase 8 details need preparation |

The implementation will use independent local mosque installations, stable per-user storage and separate demo profiles. No shared cloud database, telemetry, live providers, real-record migration or deployment is authorized by this brief. Limited real-data rollout requires the explicit Stage C approval in the brief after technical and organizational gates pass.

Optional commercial licensing will not block the pilot or restrict access to records, exports or recovery. Unsigned test artifacts, if the environment allows them, will be clearly labeled and will not be described as production-signed.
