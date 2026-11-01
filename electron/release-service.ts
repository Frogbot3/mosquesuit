import { platform, release, arch } from 'node:os';
import type { WorkspaceStore } from './database/store';
import type { ReleaseState } from '../shared/release';
import policy from '../release-policy.json';
import { compareVersions, verifiedLicense, verifiedManifest } from './release-trust';

// Runtime licensing is informational. No domain service consults it to grant or deny access.
export class ReleaseService {
  private availableVersion = '';
  private notes = '0.8.0-rc.1: mosque configuration, reviewed CSV/XLSX imports, family PDF, safe diagnostics and offline license verification. Unsigned testing candidate; production approval pending.';
  private failures: { at: string; operation: 'setup' | 'import' | 'release' | 'output'; category: 'validation' | 'permission' | 'operation_failed' }[] = [];
  constructor(private readonly store: WorkspaceStore, private readonly version: string) {}
  recordFailure(operation: 'setup' | 'import' | 'release' | 'output', category: 'validation' | 'permission' | 'operation_failed') { this.failures.push({ at: new Date().toISOString(), operation, category }); this.failures = this.failures.slice(-50); }
  private workspaceId() { return (this.store.security.db.prepare('SELECT workspace_id FROM security_settings WHERE id=1').get() as { workspace_id: string }).workspace_id; }
  state(): ReleaseState {
    this.store.security.require();
    const row = this.store.security.db.prepare('SELECT license_envelope,update_checked_at,update_status FROM deployment_settings WHERE id=1').get() as { license_envelope: string; update_checked_at: string | null; update_status: string };
    let licenseStatus = 'optional', edition = 'Community / Testing';
    if (row.license_envelope) { try { const license = verifiedLicense(JSON.parse(row.license_envelope), policy.licensePublicKey, this.workspaceId()); licenseStatus = license.status; edition = license.value.edition; } catch { licenseStatus = 'invalid'; } }
    return { version: this.version, schemaVersion: this.store.getSchemaVersion(), edition, licenseStatus, updateStatus: row.update_status, lastCheck: row.update_checked_at, availableVersion: this.availableVersion, releaseNotes: this.notes, supportEmail: policy.supportEmail, publisher: policy.publisher, signedBuild: false };
  }
  async check() {
    const auth = this.store.security; auth.require('settings.change'); auth.global();
    let status = 'not_configured';
    if (policy.manifestUrl && policy.releasePublicKey && policy.publisher) {
      try {
        const url = new URL(policy.manifestUrl); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('UPDATE_ORIGIN');
        const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' }, credentials: 'omit' });
        if (!response.ok || !response.body) throw new Error('UPDATE_RESPONSE');
        const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
        try { for (;;) { const item = await reader.read(); if (item.done) break; total += item.value.length; if (total > 65536) throw new Error('UPDATE_SIZE'); chunks.push(item.value); } } finally { await reader.cancel(); }
        const manifest = verifiedManifest(JSON.parse(Buffer.concat(chunks).toString('utf8')), policy, this.version, this.store.getSchemaVersion());
        auth.require('settings.change'); this.availableVersion = manifest.version; this.notes = manifest.notes;
        status = compareVersions(manifest.version, this.version) > 0 ? 'available_manual_review' : 'up_to_date';
      } catch { this.availableVersion = ''; status = 'check_failed'; this.recordFailure('release', 'operation_failed'); }
    }
    auth.require('settings.change'); auth.global();
    this.store.security.db.prepare('UPDATE deployment_settings SET update_checked_at=?,update_status=? WHERE id=1').run(new Date().toISOString(), status);
    return this.state();
  }
  activate(envelope: unknown) {
    this.store.security.require('settings.change'); this.store.security.global();
    verifiedLicense(envelope, policy.licensePublicKey, this.workspaceId());
    this.store.security.db.prepare('UPDATE deployment_settings SET license_envelope=? WHERE id=1').run(JSON.stringify(envelope));
    this.store.security.audit('license.replaced', 'license', ''); return this.state();
  }
  diagnostics() {
    this.store.security.require('data.export'); this.store.security.require('audit.view'); this.store.security.global();
    const db = this.store.security.db;
    const backup = db.prepare("SELECT at,status FROM backup_history WHERE kind IN('manual','scheduled') ORDER BY at DESC LIMIT 1").get() as { at: string; status: string } | undefined;
    let storage = 'check_failed'; try { storage = this.store.checkStorage().integrity; } catch { /* No raw error text or database contents. */ }
    return { format: 1, generatedAt: new Date().toISOString(), version: this.version, os: { platform: platform(), release: release(), architecture: arch() }, schemaVersion: this.store.getSchemaVersion(), storage, backup: backup ? { at: backup.at, status: ['verified', 'failed'].includes(backup.status) ? backup.status : 'unknown' } : { status: 'never_created' }, errors: this.failures.map(item => ({ ...item })) };
  }
}
