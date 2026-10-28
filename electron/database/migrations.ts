import { integrationsMigration } from './integrations-migration';
import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { registrationMigration } from './registration-migration';
import { lifeEventsMigration } from './life-events-migration';
import { financeMigration } from './finance-migration';

export interface Migration { version: number; name: string; sql: string }

// Applied SQL is immutable. Add a new migration instead of editing a released one.
export const migrations: Migration[] = [{
  version: 1,
  name: 'workspace_foundation',
  sql: `
    CREATE TABLE mosque_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
      name_ml TEXT NOT NULL DEFAULT '' CHECK (length(name_ml) <= 120),
      address TEXT NOT NULL DEFAULT '' CHECK (length(address) <= 400),
      contact TEXT NOT NULL DEFAULT '' CHECK (length(contact) <= 40),
      locale TEXT NOT NULL DEFAULT 'en' CHECK (locale IN ('en','ml')),
      theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark','system')),
      revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
    ) STRICT;
    CREATE TABLE wards (
      id TEXT PRIMARY KEY,
      mosque_id INTEGER NOT NULL DEFAULT 1 REFERENCES mosque_settings(id) ON DELETE RESTRICT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
      name_ml TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ) STRICT;
    CREATE INDEX idx_wards_active_order ON wards(active, sort_order);
    CREATE TABLE audit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('workspace.created','settings.updated','demo.reset')),
      actor TEXT NOT NULL DEFAULT 'local-preview',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ) STRICT;
    CREATE INDEX idx_audit_created ON audit_events(created_at);
    CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events
      BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;
    CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events
      BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;
    INSERT INTO mosque_settings (id,name,name_ml) VALUES (1,'Demo Mosque','മാതൃകാ പള്ളി');
    INSERT INTO wards (id,code,name,name_ml,sort_order) VALUES
      ('ward-1','W1','Ward 1','വാർഡ് 1',1),
      ('ward-2','W2','Ward 2','വാർഡ് 2',2),
      ('ward-3','W3','Ward 3','വാർഡ് 3',3),
      ('ward-4','W4','Ward 4','വാർഡ് 4',4);
    INSERT INTO audit_events (kind) VALUES ('workspace.created');
  `,
}, registrationMigration, lifeEventsMigration, financeMigration, integrationsMigration];

export function checksum(migration: Migration): string {
  return createHash('sha256').update(`${migration.version}:${migration.name}:${migration.sql}`).digest('hex');
}

export function migrate(db: Database.Database, definitions = migrations): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT`);
  db.transaction(() => {
    const applied = db.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all() as
      { version: number; name: string; checksum: string }[];
    if (applied.length > definitions.length) throw new Error('Database is newer than this application.');
    for (let i = 0; i < definitions.length; i++) {
      const migration = definitions[i];
      if (migration.version !== i + 1) throw new Error('Migration sequence is invalid.');
      const existing = applied[i];
      if (existing) {
        if (existing.version !== migration.version || existing.name !== migration.name || existing.checksum !== checksum(migration)) {
          throw new Error('Migration history does not match this application.');
        }
      } else {
        db.exec(migration.sql);
        db.prepare('INSERT INTO schema_migrations (version,name,checksum) VALUES (?,?,?)')
          .run(migration.version, migration.name, checksum(migration));
      }
    }
  }).exclusive();
}
