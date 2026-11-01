import type { Migration } from './migrations';
export const releaseMigration: Migration = { version: 7, name: 'deployment_setup_import_release', sql: `
  CREATE TABLE deployment_settings (
    id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0,
    setup_complete INTEGER NOT NULL DEFAULT 0 CHECK(setup_complete IN(0,1)),
    email TEXT NOT NULL DEFAULT '', financial_year_start INTEGER NOT NULL DEFAULT 4 CHECK(financial_year_start BETWEEN 1 AND 12),
    license_envelope TEXT NOT NULL DEFAULT '', update_checked_at TEXT, update_status TEXT NOT NULL DEFAULT 'not_configured'
  ) STRICT;
  INSERT INTO deployment_settings(id) VALUES(1);
  CREATE TABLE import_batches (
    id TEXT PRIMARY KEY, source_sha256 TEXT NOT NULL, families INTEGER NOT NULL, members INTEGER NOT NULL,
    wards INTEGER NOT NULL, staff_id TEXT NOT NULL REFERENCES staff_users(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ) STRICT;
  CREATE TRIGGER import_batches_no_update BEFORE UPDATE ON import_batches BEGIN SELECT RAISE(ABORT, 'Import history is append-only'); END;
  CREATE TRIGGER import_batches_no_delete BEFORE DELETE ON import_batches BEGIN SELECT RAISE(ABORT, 'Import history is append-only'); END;
` };
