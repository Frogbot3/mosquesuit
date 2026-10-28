import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { ConflictError, WorkspaceStore } from '../../electron/database/store';
import { migrate, migrations } from '../../electron/database/migrations';

const stores: WorkspaceStore[] = [];
const dirs: string[] = [];
function open(file = ':memory:') { const store = new WorkspaceStore(file); stores.push(store); return store; }
afterEach(() => { stores.splice(0).forEach(store => store.close()); dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })); });

describe('workspace storage', () => {
  it('migrates a new database and seeds exactly four fictional wards', () => {
    const store = open();
    expect(store.getSchemaVersion()).toBe(4);
    expect(store.getWards().map(ward => ward.code)).toEqual(['W1', 'W2', 'W3', 'W4']);
    expect(store.getSettings().name).toBe('Demo Mosque');
    expect(store.getActivity()).toHaveLength(1);
    expect(store.checkStorage()).toMatchObject({ integrity: 'ok', foreignKeys: true });
  });
  it('persists Malayalam and settings across close and reopen without reseeding', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mosque-store-')); dirs.push(dir);
    const file = join(dir, 'workspace.sqlite3'); const first = open(file);
    first.saveSettings({ ...first.getSettings(), name: 'Fictional Test Mosque', nameMl: 'മാതൃകാ പള്ളി', address: 'സാങ്കൽപ്പിക വിലാസം', theme: 'dark' });
    first.close(); const second = open(file);
    expect(second.getSettings()).toMatchObject({ nameMl: 'മാതൃകാ പള്ളി', address: 'സാങ്കൽപ്പിക വിലാസം', theme: 'dark', revision: 1 });
    expect(second.getWards()).toHaveLength(4); expect(second.getActivity()).toHaveLength(2);
    expect(second.checkStorage().journalMode).toBe('wal');
  });
  it('rejects invalid, unexpected and oversized fields without writes', () => {
    const store = open(); const settings = store.getSettings();
    for (const update of [{ name: '' }, { name: 'x'.repeat(121) }, { contact: 'not a phone' }, { theme: 'untrusted' }, { sql: 'DROP TABLE wards' }, { address: 'bad\0text' }]) {
      expect(() => store.saveSettings({ ...settings, ...update })).toThrow();
    }
    expect(store.getSettings()).toEqual(settings); expect(store.getActivity()).toHaveLength(1);
  });
  it('uses parameters for SQL-like input', () => {
    const store = open(); const name = "Test'); DROP TABLE wards; --";
    store.saveSettings({ ...store.getSettings(), name });
    expect(store.getSettings().name).toBe(name); expect(store.getWards()).toHaveLength(4);
  });
  it('prevents stale changes from overwriting a newer revision', () => {
    const store = open(); const stale = store.getSettings();
    store.saveSettings({ ...stale, name: 'Saved fictional name' });
    expect(() => store.saveSettings({ ...stale, name: 'Stale name' })).toThrow(ConflictError);
    expect(store.getSettings().name).toBe('Saved fictional name'); expect(store.getActivity()).toHaveLength(2);
  });
  it('resets development settings while preserving activity and advancing revision', () => {
    const store = open(); store.saveSettings({ ...store.getSettings(), name: 'Changed', locale: 'ml' }); store.resetDemo();
    expect(store.getSettings()).toMatchObject({ name: 'Demo Mosque', locale: 'en', revision: 2 });
    expect(store.getActivity().map(event => event.kind)).toEqual(['demo.reset', 'settings.updated', 'workspace.created']);
  });
  it('rolls back the settings write if its audit append fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mosque-atomic-')); dirs.push(dir);
    const file = join(dir, 'workspace.sqlite3'); const store = open(file); const before = store.getSettings();
    const connection = new Database(file);
    connection.exec("CREATE TRIGGER reject_audit BEFORE INSERT ON audit_events BEGIN SELECT RAISE(ABORT,'disk simulation'); END");
    connection.close();
    expect(() => store.saveSettings({ ...before, name: 'Must not commit' })).toThrow();
    expect(store.getSettings()).toEqual(before);
  });
});

describe('migration guarantees', () => {
  it('applies only once and enforces relationships and append-only audit', () => {
    const db = new Database(':memory:'); db.pragma('foreign_keys=ON');
    try {
      migrate(db); migrate(db);
      expect(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get()).toEqual({ n: 4 });
      expect(() => db.prepare("INSERT INTO wards(id,mosque_id,code,name,sort_order) VALUES('bad',2,'X','bad',9)").run()).toThrow();
      expect(() => db.exec('DELETE FROM audit_events')).toThrow('append-only');
      expect(() => db.exec("UPDATE audit_events SET kind='demo.reset'")).toThrow('append-only');
    } finally { db.close(); }
  });
  it('rejects changed checksums and unknown newer versions', () => {
    const db = new Database(':memory:');
    try {
      migrate(db);
      expect(() => migrate(db, [{ ...migrations[0], sql: `${migrations[0].sql}\n-- changed` }, ...migrations.slice(1)])).toThrow('history');
      db.prepare("INSERT INTO schema_migrations(version,name,checksum) VALUES(5,'future','unknown')").run();
      expect(() => migrate(db)).toThrow('newer');
    } finally { db.close(); }
  });
  it('rolls back failed migration SQL and version bookkeeping together', () => {
    const db = new Database(':memory:');
    try {
      migrate(db);
      expect(() => migrate(db, [...migrations, { version: 5, name: 'broken', sql: 'CREATE TABLE should_rollback(id INTEGER); INSERT INTO missing VALUES(1);' }])).toThrow();
      expect(db.prepare("SELECT name FROM sqlite_master WHERE name='should_rollback'").get()).toBeUndefined();
      expect(db.prepare('SELECT MAX(version) AS n FROM schema_migrations').get()).toEqual({ n: 4 });
    } finally { db.close(); }
  });
});
