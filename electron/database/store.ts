import { SecurityStore } from './security-store';
import { authorizedService } from './authorized-services';
import { IntegrationsStore } from './integrations-store';
import Database from 'better-sqlite3';
import { settingsSchema, type Settings, type Ward, type AuditEvent, type StorageHealth } from '../../shared/contracts';
import { migrate } from './migrations';
import { RegistrationStore } from './registration-store';
import { LifeEventsStore } from './life-events-store';
import { FinanceStore } from './finance-store';

export class ConflictError extends Error {}

export class WorkspaceStore {
  private readonly db: Database.Database;
  readonly security:SecurityStore;
  readonly registration: RegistrationStore;
  readonly lifeEvents: LifeEventsStore;
  readonly finance: FinanceStore;
  readonly integrations: IntegrationsStore;

  constructor(filename: string, lifeEventsDemo = false, financeDemo = false, integrationsDemo = false) {
    this.db = new Database(filename);
    try {
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = FULL');
      this.db.pragma('busy_timeout = 5000');
      migrate(this.db);
      this.security = new SecurityStore(this.db);
      const domainDb=this.security.guardedDatabase();
      const registrations = new RegistrationStore(domainDb,()=>this.security.wards());
      const events = new LifeEventsStore(domainDb, lifeEventsDemo);
      const finance = new FinanceStore(domainDb, financeDemo);
      const integrations = new IntegrationsStore(domainDb,finance,integrationsDemo);
      this.registration=authorizedService('registration',registrations,this.security,this.db,finance);
      this.lifeEvents=authorizedService('lifeEvents',events,this.security,this.db,finance);
      this.finance=authorizedService('finance',finance,this.security,this.db,finance);
      this.integrations=authorizedService('integrations',integrations,this.security,this.db,finance);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  getSettings(): Settings {
    this.security.require();
    return settingsSchema.parse(this.db.prepare(`SELECT name, name_ml AS nameMl, address, contact, locale, theme, revision
      FROM mosque_settings WHERE id=1`).get());
  }

  saveSettings(input: unknown): Settings {
    this.security.require('settings.change');this.security.global();
    const settings = settingsSchema.parse(input);
    return this.db.transaction(() => {
      const result = this.db.prepare(`UPDATE mosque_settings SET name=@name,name_ml=@nameMl,address=@address,
        contact=@contact,locale=@locale,theme=@theme,revision=revision+1 WHERE id=1 AND revision=@revision`).run(settings);
      if (result.changes !== 1) throw new ConflictError('Settings have changed. Reload and try again.');
      this.db.prepare("INSERT INTO audit_events (kind) VALUES ('settings.updated')").run();
      this.security.audit('settings.changed','settings','1');
      return this.getSettings();
    })();
  }

  getWards(): Ward[] {
    const scope=this.security.wards();
    const rows = this.db.prepare('SELECT id,code,name,name_ml AS nameMl,active FROM wards ORDER BY sort_order,code').all() as
      (Omit<Ward, 'active'> & { active: number })[];
    return rows.filter(row=>scope===null||scope.includes(row.id)).map(row => ({ ...row, active: row.active === 1 }));
  }

  getActivity(): AuditEvent[] {
    this.security.require();if(!this.security.state().permissions.includes('audit.view')||!this.security.require().allWards)return [];
    return this.db.prepare('SELECT id,kind,created_at AS createdAt FROM audit_events ORDER BY id DESC LIMIT 50').all() as AuditEvent[];
  }

  getSchemaVersion(): number {
    return (this.db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as { version: number }).version;
  }

  checkStorage(): StorageHealth {
    this.security.require();
    if (this.db.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Database integrity check failed.');
    if ((this.db.pragma('foreign_key_check') as unknown[]).length > 0) throw new Error('Database relationship check failed.');
    return {
      integrity: 'ok', schemaVersion: this.getSchemaVersion(),
      foreignKeys: this.db.pragma('foreign_keys', { simple: true }) === 1,
      journalMode: String(this.db.pragma('journal_mode', { simple: true })),
    };
  }

  resetDemo(): void {
    this.security.require('settings.change');this.security.global();
    this.db.transaction(() => {
      this.db.prepare(`UPDATE mosque_settings SET name='Demo Mosque',name_ml='മാതൃകാ പള്ളി',address='',contact='',
        locale='en',theme='light',revision=revision+1 WHERE id=1`).run();
      this.db.prepare("INSERT INTO audit_events (kind) VALUES ('demo.reset')").run();
    })();
  }

  onlineSnapshot(destination:string){return this.db.backup(destination);}
  close(): void { if (this.db.open) this.db.close(); }
}
