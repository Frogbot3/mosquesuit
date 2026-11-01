import { randomUUID } from 'node:crypto';
import type { WorkspaceStore } from './database/store';
import { ConflictError } from './database/store';
import { mosqueSetupSchema, type DeploymentSettings } from '../shared/release';
import { SecurityError } from '../shared/security';

export class DeploymentService {
  constructor(private readonly store: WorkspaceStore) {}
  state(): DeploymentSettings {
    this.store.security.require('settings.change'); this.store.security.global();
    const db = this.store.security.db;
    const row = db.prepare('SELECT revision, setup_complete, email, financial_year_start FROM deployment_settings WHERE id=1').get() as { revision: number; setup_complete: number; email: string; financial_year_start: number };
    const finance = db.prepare('SELECT receipt_prefix,logo FROM finance_settings WHERE id=1').get() as { receipt_prefix: string; logo: string };
    return { revision: row.revision, setupComplete: Boolean(row.setup_complete), email: row.email, financialYearStart: row.financial_year_start, receiptPrefix: finance.receipt_prefix, currency: 'INR', logo: finance.logo, mosque: this.store.getSettings(), wards: this.store.getWards() };
  }
  save(input: unknown): DeploymentSettings {
    const value = mosqueSetupSchema.parse(input), auth = this.store.security, db = auth.db;
    auth.reauthenticate(value.currentPassword, 'settings.change'); auth.require('finance.configure'); auth.global();
    db.transaction(() => {
      const state = this.state(); if (state.revision !== value.revision) throw new ConflictError('STALE_SETUP');
      const existing = state.wards;
      // Omitted wards are retained; explicit deactivation preserves all historical links.
      if (existing.some(w => !value.wards.some(next => next.id === w.id))) throw new Error('WARD_MISSING');
      for (const ward of value.wards) {
        const code = ward.code.toUpperCase();
        if (ward.id) {
          const old = existing.find(w => w.id === ward.id); if (!old) throw new SecurityError('AUTH_SCOPE');
          if (!ward.active && db.prepare('SELECT 1 FROM families WHERE ward_id=? LIMIT 1').get(ward.id)) throw new Error('WARD_IN_USE');
          db.prepare('UPDATE wards SET code=?,name=?,name_ml=?,active=? WHERE id=?').run(code, ward.name, ward.nameMl, +ward.active, ward.id);
        } else db.prepare('INSERT INTO wards(id,code,name,name_ml,active,sort_order) VALUES(?,?,?,?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM wards))').run(randomUUID(), code, ward.name, ward.nameMl, +ward.active);
      }
      this.store.saveSettings({ ...state.mosque, name: value.name, nameMl: value.nameMl, address: value.address, contact: value.contact, locale: value.locale });
      db.prepare('UPDATE deployment_settings SET setup_complete=1,email=?,financial_year_start=?,revision=revision+1 WHERE id=1').run(value.email, value.financialYearStart);
      // Receipt snapshots are immutable; this prefix applies only to future receipts.
      db.prepare('UPDATE finance_settings SET receipt_prefix=?,revision=revision+1 WHERE id=1').run(value.receiptPrefix);
      auth.audit('deployment.configured', 'settings', '1', 'success', 'Mosque identity, wards and future receipt settings updated');
    }).immediate();
    return this.state();
  }
  setLogo(data: string): string {
    this.store.security.require('settings.change'); this.store.security.require('finance.configure'); this.store.security.global();
    this.store.security.db.transaction(() => {
      this.store.security.db.prepare('UPDATE finance_settings SET logo=?,revision=revision+1 WHERE id=1').run(data);
      this.store.security.db.prepare('UPDATE deployment_settings SET revision=revision+1 WHERE id=1').run();
      this.store.security.audit('deployment.logo_changed', 'settings', '1');
    }).immediate();
    return data;
  }
}
