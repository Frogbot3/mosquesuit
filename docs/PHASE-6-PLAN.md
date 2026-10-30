# Phase 6 implementation plan

Inspection (30 October 2026): registration is accessible without a login; finance roles are selectable simulations; integration and finance workspaces are gated demos, not authorization; audit histories lack authenticated staff attribution; the existing backup is an unencrypted online SQLite snapshot with no restore. Event attachments are stored as database BLOBs. Renderer isolation, sandboxing, main-frame/origin checks, strict request schemas and offline assets already exist and must remain.

Priority order:
1. Add migration 6 and offline Argon2id credentials, first-admin bootstrap, process-bound sessions, throttling, lock/change/reset/recovery.
2. Put a fail-closed authorization facade around every public data service, constrain registry queries by server-owned wards, remove role impersonation and block unencrypted backup. Preserve low-level repository behavior and financial invariants.
3. Add append-only hash-chained security audit and privileged-change confirmation/reauthentication; prevent loss of the last active unrestricted Super Admin.
4. Build encrypted, checksummed online snapshots of the desktop and optional mock service databases. Attachments/configuration are included in SQLite. Use staged validation, encrypted safety backup and an atomic active-generation pointer for restore; keep prior data for rollback.
5. Add login/setup/lock, staff/roles/audit, backup/restore and security pages; keep passwords transient and recovery files outside the renderer.
6. Test denial paths, scoped queries, cryptography, corruption/wrong-password rejection, recovery/restore and all existing modules. Review Electron/dependencies and document Indian privacy obligations and remaining release blockers.

No live provider activation, public deployment, packaging-policy bypass or unrelated module is authorized by this work. Staff cannot supply their effective role/wards in requests. Account/role grant changes require current credentials; scoped users cannot use global aggregate/export/integration operations that could reveal other wards.
