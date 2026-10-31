import type { Migration } from "./migrations";
// Permissions are seeded as stable data below; migration history remains immutable.
const permissions = [
  "families.view",
  "families.create",
  "families.edit",
  "families.archive",
  "members.view",
  "identity.view",
  "life.marriage",
  "life.divorce",
  "life.death",
  "finance.view",
  "payments.record",
  "payments.reverse",
  "donations.manage",
  "expenses.record",
  "expenses.approve",
  "finance.configure",
  "reports.generate",
  "data.export",
  "notifications.send",
  "staff.manage",
  "settings.change",
  "backup.create",
  "backup.restore",
  "audit.view",
  "security.configure",
] as const;
type Permission = (typeof permissions)[number];
const roleIds = [
  "super_admin",
  "secretary",
  "accountant",
  "ward_operator",
  "data_entry",
  "read_only",
] as const;
type RoleId = (typeof roleIds)[number];
const defaultPermissions: Record<RoleId, Permission[]> = {
  super_admin: [...permissions],
  secretary: permissions.filter(
    (p) =>
      ![
        "staff.manage",
        "backup.restore",
        "security.configure",
        "identity.view",
        "payments.reverse",
      ].includes(p),
  ),
  accountant: [
    "families.view",
    "members.view",
    "finance.view",
    "payments.record",
    "donations.manage",
    "expenses.record",
    "reports.generate",
    "data.export",
    "notifications.send",
  ],
  ward_operator: [
    "families.view",
    "families.create",
    "families.edit",
    "members.view",
  ],
  data_entry: [
    "families.view",
    "families.create",
    "families.edit",
    "members.view",
  ],
  read_only: ["families.view", "members.view", "finance.view"],
};

export const securityMigration: Migration = {
  version: 6,
  name: "staff_security_and_recovery",
  sql: `
CREATE TABLE roles(id TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0) STRICT;
CREATE TABLE permissions(id TEXT PRIMARY KEY) STRICT;
CREATE TABLE role_permissions(role_id TEXT NOT NULL REFERENCES roles(id),permission_id TEXT NOT NULL REFERENCES permissions(id),PRIMARY KEY(role_id,permission_id)) STRICT;
${roleIds.map((id) => `INSERT INTO roles(id) VALUES('${id}');`).join("\n")}
${permissions.map((id) => `INSERT INTO permissions VALUES('${id}');`).join("\n")}
${roleIds.flatMap((role) => defaultPermissions[role].map((permission) => `INSERT INTO role_permissions VALUES('${role}','${permission}');`)).join("\n")}
CREATE TABLE staff_users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,password_hash TEXT NOT NULL,role_id TEXT NOT NULL REFERENCES roles(id),active INTEGER NOT NULL CHECK(active IN(0,1)),all_wards INTEGER NOT NULL CHECK(all_wards IN(0,1)),revision INTEGER NOT NULL DEFAULT 0,last_login INTEGER NOT NULL DEFAULT 0,must_change_password INTEGER NOT NULL DEFAULT 0 CHECK(must_change_password IN(0,1)),recovery_hash TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL) STRICT;
CREATE TABLE staff_ward_assignments(staff_id TEXT NOT NULL REFERENCES staff_users(id),ward_id TEXT NOT NULL REFERENCES wards(id),PRIMARY KEY(staff_id,ward_id)) STRICT;
CREATE TABLE sessions(id TEXT PRIMARY KEY,staff_id TEXT NOT NULL REFERENCES staff_users(id),token_hash TEXT NOT NULL UNIQUE,created_at INTEGER NOT NULL,last_activity INTEGER NOT NULL,locked INTEGER NOT NULL DEFAULT 0,revoked INTEGER NOT NULL DEFAULT 0) STRICT;
CREATE INDEX idx_sessions_staff ON sessions(staff_id,revoked);
CREATE TABLE login_attempts(id INTEGER PRIMARY KEY,identity_hash TEXT NOT NULL,at INTEGER NOT NULL,success INTEGER NOT NULL) STRICT;
CREATE INDEX idx_login_throttle ON login_attempts(identity_hash,at);
CREATE TABLE audit_logs(seq INTEGER PRIMARY KEY,id TEXT NOT NULL UNIQUE,at INTEGER NOT NULL,staff_id TEXT REFERENCES staff_users(id),action TEXT NOT NULL,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,outcome TEXT NOT NULL CHECK(outcome IN('success','failure','denied')),summary TEXT NOT NULL,correlation_id TEXT NOT NULL,previous_hash TEXT NOT NULL,hash TEXT NOT NULL) STRICT;
CREATE INDEX idx_security_audit_time ON audit_logs(at,action);
CREATE TABLE backup_history(id TEXT PRIMARY KEY,at INTEGER NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,filename TEXT NOT NULL,digest TEXT NOT NULL,message TEXT NOT NULL,staff_id TEXT REFERENCES staff_users(id)) STRICT;
CREATE TABLE security_settings(id INTEGER PRIMARY KEY CHECK(id=1),workspace_id TEXT NOT NULL,idle_minutes INTEGER NOT NULL DEFAULT 10,locale TEXT NOT NULL DEFAULT 'en',backup_destination TEXT NOT NULL DEFAULT '',backup_scheduled INTEGER NOT NULL DEFAULT 0,backup_interval_hours INTEGER NOT NULL DEFAULT 24,backup_retain INTEGER NOT NULL DEFAULT 7,backup_owner TEXT REFERENCES staff_users(id),backup_last_at INTEGER NOT NULL DEFAULT 0) STRICT;
${["audit_logs", "login_attempts", "backup_history"].map((table) => `CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'Security history is append-only'); END; CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'Security history is append-only'); END;`).join("\n")}
`,
};
