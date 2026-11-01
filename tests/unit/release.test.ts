import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import ExcelJS from 'exceljs';
import Database from 'better-sqlite3';
import { WorkspaceStore } from '../../electron/database/store';
import { DeploymentService } from '../../electron/deployment-service';
import { ImportService, parseCsv, parseImport } from '../../electron/import-service';
import { ReleaseService } from '../../electron/release-service';
import { compareVersions, verifiedManifest, verifiedLicense } from '../../electron/release-trust';
import { checkedWorkspace, markWorkspaceEstablished, activateWorkspace } from '../../electron/workspace-path';
import { migrate, migrations } from '../../electron/database/migrations';
import { BackupService } from '../../electron/backup-service';
import { fictionalFamily } from '../fixtures/registration';
import type { ImportPreview } from '../../shared/release';
const password = 'Fictional release administrator 123!', secret = 'Fictional backup passphrase 456!';
const stores: WorkspaceStore[] = [], roots: string[] = [], backups: BackupService[] = [];
function root() { const path = mkdtempSync(join(tmpdir(), 'mosque-release-')); roots.push(path); return path; }
function fixture(filename = ':memory:', requireConfiguration = false) {
  const store = new WorkspaceStore(filename, true, true, false, requireConfiguration); stores.push(store);
  store.security.bootstrap({ username: 'release.admin', name: 'Fictional administrator', password, confirmed: true }); store.security.login({ username: 'release.admin', password }); return store;
}
afterEach(async () => { for (const b of backups.splice(0)) await b.dispose(); stores.splice(0).forEach(s => s.close()); roots.splice(0).forEach(p => { if (!/^mosque-release-[A-Za-z0-9]+$/.test(relative(resolve(tmpdir()), p))) throw new Error('Unsafe cleanup'); rmSync(p, { recursive: true, force: true }); }); });
const csv = 'wardCode,wardName,familyNumber,memberName,memberNameMl,relationship,dob,phone\nN1,Fictional North,001,Fictional Ameen,മാതൃകാ അമീൻ,guardian,1980-01-01,9000000001\nN1,Fictional North,001,Fictional Safiya,മാതൃകാ സഫിയ,spouse,1990-01-01,\nN1,Fictional North,002,Fictional Second,,guardian,,\n';
async function stage(service: ImportService, content = csv, familyLimit = 5) {
  const source = await service.select(Buffer.from(content), '.csv', 'fictional.csv');
  return service.preview({ sourceId: source.sourceId, mapping: Object.fromEntries(source.columns.map(c => [c, c])), familyLimit });
}
const commit = (p: ImportPreview) => ({ previewId: p.previewId, currentPassword: password, backupPassword: secret, confirmation: 'IMPORT VERIFIED RECORDS', acknowledgeWarnings: true });
describe('release configuration, initialization and migrations', () => {
  it('requires setup before writes and atomically saves flexible wards, identity and future receipt prefix', () => {
    const s = fixture(':memory:', true), service = new DeploymentService(s), state = service.state();
    expect(s.setupRequired()).toBe(true); expect(() => s.registration.save(fictionalFamily())).toThrow();
    const input = { revision: state.revision, name: 'Fictional Crescent', nameMl: 'മാതൃകാ പള്ളി', address: 'Fictional Lane', contact: '9000000000', email: '', locale: 'ml', receiptPrefix: 'TEST', financialYearStart: 1, wards: [...state.wards, { id: '', code: 'N5', name: 'Fifth ward', nameMl: 'അഞ്ചാം വാർഡ്', active: true }], currentPassword: password, confirmed: true };
    const saved = service.save(input); expect(saved.wards).toHaveLength(5); expect(saved.financialYearStart).toBe(1); expect(s.setupRequired()).toBe(false); s.registration.save(fictionalFamily());
    expect(() => service.save(input)).toThrow('STALE_SETUP');
    expect(() => service.save({ ...input, revision: saved.revision, wards: saved.wards.map(w => ({ ...w, active: w.id !== 'ward-1' })) })).toThrow('WARD_IN_USE'); expect(service.state().revision).toBe(saved.revision);
  });
  it('refuses blank recreation after establishment or a missing restored generation', () => {
    const p = root(); expect(checkedWorkspace(p)).toBe(p); markWorkspaceEstablished(p); expect(() => checkedWorkspace(p)).toThrow('missing');
    writeFileSync(join(p, 'mosque-suite.sqlite3'), 'placeholder'); expect(checkedWorkspace(p)).toBe(p);
    const generation = `generation-${randomUUID()}`; mkdirSync(join(p, 'recovery', generation), { recursive: true }); activateWorkspace(p, generation); expect(() => checkedWorkspace(p)).toThrow('missing');
  });
  it('preserves schema-6 records through additive upgrade and refuses risky or downward migrations', () => {
    const db = new Database(':memory:'); try { migrate(db, migrations.slice(0, 6)); db.prepare("UPDATE mosque_settings SET name='Preserved fixture' WHERE id=1").run(); migrate(db); expect(db.prepare('SELECT name FROM mosque_settings').get()).toEqual({ name: 'Preserved fixture' });
      expect(() => migrate(db, migrations.slice(0, 6))).toThrow('newer'); expect(() => migrate(db, [...migrations, { version: 8, name: 'risky', sql: 'DROP TABLE members', requiresOfflineCheckpoint: true }])).toThrow('checkpoint'); expect(db.prepare('SELECT MAX(version) n FROM schema_migrations').get()).toEqual({ n: 7 });
    } finally { db.close(); }
  });
});
describe('bounded and reviewed imports', () => {
  it('parses quoted commas/newlines, Malayalam, UTF-16 and rejects malformed CSV', async () => {
    expect(parseCsv('a,b\n"മലയാളം, one","two\nlines"')).toEqual([['a', 'b'], ['മലയാളം, one', 'two\nlines']]);
    const source = await parseImport(Buffer.concat([Buffer.from([255,254]), Buffer.from('a,b\nമലയാളം,x', 'utf16le')]), '.csv'); expect(source.encoding).toBe('utf-16le'); expect(source.rows[0][0]).toBe('മലയാളം');
    expect(() => parseCsv('a\n"unterminated')).toThrow(); await expect(parseImport(Buffer.from('a,a\nx,y'), '.csv')).rejects.toThrow('HEADERS'); await expect(parseImport(Buffer.alloc(4 * 1024 * 1024 + 1), '.csv')).rejects.toThrow('LIMIT');
  });
  it('reads real XLSX Unicode/date values and rejects formulas, extra sheets and sparse oversized rows', async () => {
    const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Records'); sheet.addRow(['memberNameMl', 'dob']); sheet.addRow(['മലയാളം', new Date('1990-01-01T00:00:00Z')]);
    const bytes = async () => Buffer.from(await book.xlsx.writeBuffer()); const parsed = await parseImport(await bytes(), '.xlsx'); expect(parsed.rows[0]).toEqual(['മലയാളം', '1990-01-01']);
    sheet.getCell('A2').value = { formula: '1+1', result: 2 }; await expect(parseImport(await bytes(), '.xlsx')).rejects.toThrow('FORMULA'); sheet.getCell('A2').value = 'text';
    const second = book.addWorksheet('Extra'); await expect(parseImport(await bytes(), '.xlsx')).rejects.toThrow('ONE_SHEET'); book.removeWorksheet(second.id);
    sheet.getCell('A10002').value = 'oversized'; await expect(parseImport(await bytes(), '.xlsx')).rejects.toThrow('ROW_LIMIT');
  });
  it('preserves actual row numbers, catches invalid phones/dates and refuses incomplete guardians', async () => {
    const s = fixture(), b = { create: vi.fn() }, service = new ImportService(s, b);
    const p = await stage(service, csv.replace('N1,Fictional North,001,Fictional Ameen', '\nN1,Fictional North,001,Fictional Ameen').replace('1980-01-01,9000000001', '1980-02-31,abc'));
    expect(p.issues).toEqual(expect.arrayContaining([expect.objectContaining({ row: 3, code: 'invalidDate' }), expect.objectContaining({ row: 3, code: 'invalidPhone' })]));
    await expect(service.commit(commit(p))).rejects.toThrow('IMPORT_INVALID'); expect(b.create).not.toHaveBeenCalled(); expect(s.registration.counts().families).toBe(0);
    const missing = await stage(service, csv.replaceAll('guardian', 'unknown')); expect(missing.issues.some(i => i.code === 'ONE_GUARDIAN_REQUIRED')).toBe(true);
  });
  it('commits only the reviewed small batch and rejects duplicate families without merging', async () => {
    const s = fixture(), b = { create: vi.fn(async () => true) }, service = new ImportService(s, b);
    const p = await stage(service, csv, 1); expect(p.families).toBe(1); expect(p.members).toBe(2);
    const result = await s.security.backupOperation(() => service.commit(commit(p))); expect(result).toEqual({ families: 1, members: 2, wards: 1 }); expect(b.create).toHaveBeenCalledWith(secret);
    const next = await stage(service); expect(next.issues.some(i => i.code === 'DUPLICATE_FAMILY')).toBe(true); await expect(service.commit(commit(next))).rejects.toThrow();
    expect(s.security.db.prepare('SELECT COUNT(*) n FROM import_batches').get()).toEqual({ n: 1 }); expect(() => s.security.db.prepare('DELETE FROM import_batches').run()).toThrow();
  });
  it('keeps records unchanged on backup failure, cancellation and mid-transaction errors', async () => {
    const s = fixture(), b = { create: vi.fn(async (): Promise<true> => { throw new Error('backup offline'); }) }, service = new ImportService(s, b);
    let p = await stage(service); await expect(service.commit(commit(p))).rejects.toThrow('backup offline'); expect(s.getWards()).toHaveLength(4); expect(s.registration.counts().families).toBe(0);
    service.cancel(); expect(() => service.report(p.previewId)).toThrow('EXPIRED'); b.create.mockResolvedValue(true); p = await stage(service);
    s.security.db.exec("CREATE TRIGGER reject_second BEFORE INSERT ON families WHEN NEW.family_number='002' BEGIN SELECT RAISE(ABORT,'simulated failure'); END");
    await expect(service.commit(commit(p))).rejects.toThrow(); expect(s.getWards()).toHaveLength(4); expect(s.registration.counts().families).toBe(0); expect(s.security.db.prepare('SELECT COUNT(*) n FROM import_batches').get()).toEqual({ n: 0 });
  });
  it('uses a real verified encrypted backup and does not deadlock its maintenance lock', async () => {
    const p = root(), data = join(p, 'data'); mkdirSync(data); const s = fixture(join(data, 'mosque-suite.sqlite3'));
    const b = new BackupService(s, data, data, { available: () => false, seal: () => { throw new Error('unused'); }, open: () => { throw new Error('unused'); } }); backups.push(b);
    await b.configure({ password: secret, currentPassword: password, scheduled: false, intervalHours: 24, retain: 3, confirmed: true }, join(p, 'external'));
    const service = new ImportService(s, b), preview = await stage(service); await s.security.backupOperation(() => service.commit(commit(preview)));
    expect((await b.state()).history.some(h => h.status === 'verified')).toBe(true); expect(s.registration.counts().families).toBe(2);
  });
  it('rejects a changed login session after awaiting backup and rejects unauthenticated preview', async () => {
    const s = fixture(), b = { create: vi.fn(async () => { s.security.logout(); s.security.login({ username: 'release.admin', password }); return true; }) }, service = new ImportService(s, b), p = await stage(service);
    await expect(s.security.backupOperation(() => service.commit(commit(p)))).rejects.toThrow(); expect(s.registration.counts().families).toBe(0); s.security.logout(); expect(() => service.preview({})).toThrow();
  });
});
describe('release trust, licenses and privacy', () => {
  const keys = generateKeyPairSync('ed25519'), publicKey = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const envelope = (v: unknown) => { const bytes = Buffer.from(JSON.stringify(v)); return { payload: bytes.toString('base64'), signature: sign(null, bytes, keys.privateKey).toString('base64') }; };
  const config = { releasePublicKey: publicKey, manifestUrl: 'https://updates.example.test/release.json', publisher: 'Fictional test publisher' };
  const manifest = { product: 'Mosque Suite', version: '0.8.0', schemaVersion: 7, publishedAt: '2026-10-31T00:00:00Z', expiresAt: '2026-12-01T00:00:00Z', notes: 'Test only', installerUrl: 'https://updates.example.test/setup.exe', sha512: 'a'.repeat(128), size: 123, publisher: config.publisher };
  const now = Date.parse('2026-11-01T00:00:00Z');
  it('verifies signed bytes and rejects tampering, cross-origin releases, expiry and downgrades', () => {
    expect(verifiedManifest(envelope(manifest), config, '0.8.0-rc.1', 7, now).version).toBe('0.8.0');
    expect(() => verifiedManifest({ ...envelope(manifest), payload: Buffer.from('{}').toString('base64') }, config, '0.8.0-rc.1', 7, now)).toThrow('SIGNATURE');
    expect(() => verifiedManifest(envelope({ ...manifest, installerUrl: 'https://other.example.test/setup.exe' }), config, '0.8.0-rc.1', 7, now)).toThrow('ORIGIN');
    expect(() => verifiedManifest(envelope(manifest), config, '0.9.0', 7, now)).toThrow('DOWNGRADE'); expect(() => verifiedManifest(envelope(manifest), config, '0.8.0-rc.1', 8, now)).toThrow('DOWNGRADE');
    expect(() => verifiedManifest(envelope(manifest), config, '0.8.0-rc.1', 7, Date.parse('2027-01-01'))).toThrow('EXPIRED'); expect(compareVersions('0.8.0-rc.10', '0.8.0-rc.2')).toBe(1);
  });
  it('checks offline licenses against the customer workspace without denying data access', () => {
    const id = randomUUID(), license = { product: 'Mosque Suite', licenseId: randomUUID(), customerReference: 'Fictional customer', workspaceId: id, edition: 'Licensed', issuedAt: '2026-01-01T00:00:00Z', expiresAt: '2026-02-01T00:00:00Z', features: [] };
    expect(verifiedLicense(envelope(license), publicKey, id, now).status).toBe('expired'); expect(() => verifiedLicense(envelope(license), publicKey, randomUUID(), now)).toThrow('MISMATCH');
    const s = fixture(), service = new ReleaseService(s, '0.8.0-rc.1'); s.security.db.prepare("UPDATE deployment_settings SET license_envelope='{}' WHERE id=1").run(); expect(service.state().licenseStatus).toBe('invalid'); s.registration.save(fictionalFamily()); expect(s.registration.counts().families).toBe(1);
  });
  it('keeps updates offline until configured and diagnostics free of records, credentials and paths', async () => {
    const s = fixture(), service = new ReleaseService(s, '0.8.0-rc.1'); s.registration.save(fictionalFamily()); expect((await service.check()).updateStatus).toBe('not_configured'); service.recordFailure('import', 'operation_failed');
    const report = JSON.stringify(service.diagnostics()); for (const forbidden of ['Fictional', 'Ameen', '9000000001', 'password', 'workspace_id', 'filename', 'destination']) expect(report).not.toContain(forbidden); expect(service.diagnostics().storage).toBe('ok');
  });
});
