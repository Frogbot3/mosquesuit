import Database from 'better-sqlite3';
import { settingsSchema, type Settings, type Ward, type AuditEvent, type StorageHealth } from '../../shared/contracts';
import { migrate } from './migrations';
import { RegistrationStore } from './registration-store';
import { LifeEventsStore } from './life-events-store';
import { FinanceStore } from './finance-store';

export class ConflictError extends Error {}

export class WorkspaceStore {
  private readonly db: Database.Database;
  readonly registration: RegistrationStore;
  readonly lifeEvents: LifeEventsStore;
  readonly finance: FinanceStore;

  constructor(filename: string, lifeEventsDemo = false, financeDemo = false) {
    this.db = new Database(filename);
    try {
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = FULL');
      this.db.pragma('busy_timeout = 5000');
      migrate(this.db);
      this.registration = new RegistrationStore(this.db);
      this.lifeEvents = new LifeEventsStore(this.db, lifeEventsDemo);
      this.finance = new FinanceStore(this.db, financeDemo);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  getSettings(): Settings {
    return settingsSchema.parse(this.db.prepare(`SELECT name, name_ml AS nameMl, address, contact, locale, theme, revision
      FROM mosque_settings WHERE id=1`).get());
  }

  saveSettings(input: unknown): Settings {
    const settings = settingsSchema.parse(input);
    return this.db.transaction(() => {
      const result = this.db.prepare(`UPDATE mosque_settings SET name=@name,name_ml=@nameMl,address=@address,
        contact=@contact,locale=@locale,theme=@theme,revision=revision+1 WHERE id=1 AND revision=@revision`).run(settings);
      if (result.changes !== 1) throw new ConflictError('Settings have changed. Reload and try again.');
      this.db.prepare("INSERT INTO audit_events (kind) VALUES ('settings.updated')").run();
      return this.getSettings();
    })();
  }

  getWards(): Ward[] {
    const rows = this.db.prepare('SELECT id,code,name,name_ml AS nameMl,active FROM wards ORDER BY sort_order,code').all() as
      (Omit<Ward, 'active'> & { active: number })[];
    return rows.map(row => ({ ...row, active: row.active === 1 }));
  }

  getActivity(): AuditEvent[] {
    return this.db.prepare('SELECT id,kind,created_at AS createdAt FROM audit_events ORDER BY id DESC LIMIT 50').all() as AuditEvent[];
  }

  getSchemaVersion(): number {
    return (this.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number }).version;
  }

  checkStorage(): StorageHealth {
    if (this.db.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Database integrity check failed.');
    if ((this.db.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('Database relationship check failed.');
    return {
      integrity: 'ok', schemaVersion: this.getSchemaVersion(),
      foreignKeys: this.db.pragma('foreign_keys', { simple: true }) === 1,
      journalMode: String(this.db.pragma('journal_mode', { simple: true })),
    };
  }

  resetDemo(): void {
    this.db.transaction(() => {
      this.db.prepare(`UPDATE mosque_settings SET name='Demo Mosque',name_ml='മാതൃകാ പള്ളി',address='',contact='',
        locale='en',theme='light',revision=revision+1 WHERE id=1`).run();
      this.db.prepare("INSERT INTO audit_events (kind) VALUES ('demo.reset')").run();
    })();
  }

  close(): void { if (this.db.open) this.db.close(); }
}
