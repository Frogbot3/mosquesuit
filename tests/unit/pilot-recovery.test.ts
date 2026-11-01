import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import Database from 'better-sqlite3';
import { seedLoadDataset, qaFilters } from '../fixtures/load-dataset';
import { WorkspaceStore } from '../fixtures/authenticated-store';
import { BackupService } from '../../electron/backup-service';
import { createMockIntegrationClient } from '../../electron/integration-client';
import { activeWorkspace } from '../../electron/workspace-path';
import { DEMO_FINANCE_CONFIRMATION as confirmation } from '../../shared/finance';
const faults = vi.hoisted(() => ({ diskFull: false }));
vi.mock('node:fs/promises', async original => {
  const fs = await original<typeof import('node:fs/promises')>();
  return { ...fs, writeFile: (...args: Parameters<typeof fs.writeFile>) => {
    if (faults.diskFull && String(args[0]).endsWith('.msbackup.tmp')) return Promise.reject(Object.assign(new Error('Injected QA disk full'), { code: 'ENOSPC' }));
    return fs.writeFile(...args);
  } };
});
const roots: string[] = [], cleanup: (() => void | Promise<void>)[] = [];
const secret = 'Fictional backup passphrase 123!';
const vault = { available: () => false, seal: () => Buffer.alloc(0), open: () => '' };
afterEach(async () => {
  faults.diskFull = false;
  for (const close of cleanup.splice(0).reverse()) await close();
  for (const root of roots.splice(0)) {
    if (!/^mosque-pilot-recovery-[A-Za-z0-9]+$/.test(relative(resolve(tmpdir()), root))) throw new Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true });
  }
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'mosque-pilot-recovery-')); roots.push(root);
  const data = join(root, 'original'); await mkdir(data);
  const meta = seedLoadDataset(join(data, 'mosque-suite.sqlite3'), 20);
  const store = new WorkspaceStore(join(data, 'mosque-suite.sqlite3'), true, true, true); cleanup.push(() => store.close());
  store.finance.generate({ key: randomUUID(), planId: meta.planId, from: '2026-12', until: '2026-12', confirmation });
  const client = await createMockIntegrationClient(join(data, 'integration-service.sqlite3'), store.integrations.workspaceId); cleanup.push(() => client.close()); store.integrations.attach(client);
  const backup = new BackupService(store, data, data, vault, client.snapshot); cleanup.push(() => backup.dispose());
  await backup.configure({ password: secret, currentPassword: 'Fictional test administrator 123!', scheduled: false, intervalHours: 24, retain: 3, confirmed: true }, join(root, 'archives'));
  return { root, data, store, backup, meta };
}
describe('pilot disaster recovery and accounting invariants', () => {
  it('rejects a disk-full safety backup without replacing the active database or leaving it frozen', async () => {
    const { data, store, backup } = await fixture(); await backup.create(secret);
    const state = await backup.state(), archive = state.history.find(h => h.status === 'verified')!.filename;
    const bytes = await readFile(archive); const preview = await backup.inspect(archive, secret);
    const before = store.finance.report({ kind: 'monthly', familyId: '', filters: qaFilters });
    faults.diskFull = true;
    await expect(backup.restore({ previewId: preview.id, currentPassword: 'Fictional test administrator 123!', confirmation: 'RESTORE VERIFIED BACKUP' })).rejects.toMatchObject({ code: 'ENOSPC' });
    faults.diskFull = false;
    expect(activeWorkspace(data)).toBe(data); expect((await backup.state()).busy).toBe(false);
    expect((await backup.state()).history[0]).toMatchObject({ status: 'failed', kind: 'restore_safety' });
    expect(store.finance.report({ kind: 'monthly', familyId: '', filters: qaFilters }).totals).toEqual(before.totals);
    expect(store.checkStorage().integrity).toBe('ok'); expect(await readFile(archive)).toEqual(bytes);
    expect((await readdir(state.destination)).filter(n => n.endsWith('.tmp'))).toEqual([]);
  }, 20000);
  it('recovers a withheld profile on a fresh machine with financial totals, audit, attachments and pending notifications intact', async () => {
    const { root, store, backup } = await fixture();
    const reports = ['monthly', 'funds', 'ledger'] as const;
    const before = reports.map(kind => store.finance.report({ kind, familyId: '', filters: qaFilters }).totals);
    expect(before[0]).toMatchObject({ billedPaise: 3600000, settledPaise: 600000, outstandingPaise: 3000000 });
    const attachment = (store.security.db.prepare('SELECT content FROM event_documents').get() as { content: Buffer }).content;
    const jobs = store.integrations.state().jobs;
    expect(jobs.every(j => j.status === 'approval')).toBe(true);
    await backup.create(secret); const archive = (await backup.state()).history.find(h => h.status === 'verified')!.filename;
    const data = join(root, 'replacement'); await mkdir(data);
    const restored = new WorkspaceStore(join(data, 'mosque-suite.sqlite3'), true, true, true); cleanup.push(() => restored.close());
    const recover = new BackupService(restored, data, data, vault); cleanup.push(() => recover.dispose());
    const preview = await recover.inspect(archive, secret); expect(preview).toMatchObject({ families: 20, members: 100, payments: 80, serviceIncluded: true, attachments: 1 });
    await recover.restore({ previewId: preview.id, currentPassword: 'Fictional test administrator 123!', confirmation: 'RESTORE VERIFIED BACKUP' });
    const reopened = new WorkspaceStore(join(activeWorkspace(data), 'mosque-suite.sqlite3'), true, true, true); cleanup.push(() => reopened.close());
    expect(reports.map(kind => reopened.finance.report({ kind, familyId: '', filters: qaFilters }).totals)).toEqual(before);
    expect(reopened.registration.counts()).toEqual({ families: 20, livingMembers: 90 });
    expect(reopened.security.integrity()).toBe(true); expect(reopened.checkStorage().integrity).toBe('ok');
    expect((reopened.security.db.prepare('SELECT content FROM event_documents').get() as { content: Buffer }).content).toEqual(attachment);
    expect(reopened.integrations.state().jobs).toEqual(jobs);
    const service = new Database(join(activeWorkspace(data), 'integration-service.sqlite3'), { readonly: true });
    try { expect(service.pragma('integrity_check', { simple: true })).toBe('ok'); } finally { service.close(); }
  }, 20000);
  it('rolls back an interrupted SQLite transaction and preserves a committed manual payment across abrupt process exit', async () => {
    const { data, store } = await fixture();
    const before = store.finance.report({ kind: 'ledger', familyId: '', filters: qaFilters }).totals;
    const filename = join(data, 'mosque-suite.sqlite3');
    const native = createRequire(import.meta.url).resolve('better-sqlite3');
    // Only this owned child touches this fictional DB. process.exit deliberately
    // bypasses db.close() to emulate a process interruption with an open WAL transaction.
    const script = `const DB=require(process.argv[1]);const db=new DB(process.argv[2]);db.pragma('foreign_keys=ON');db.exec('BEGIN IMMEDIATE');db.prepare('UPDATE mosque_settings SET name=? WHERE id=1').run('UNCOMMITTED QA CHANGE');process.exit(23);`;
    const code = await new Promise<number | null>((resolve, reject) => { const child = spawn(process.execPath, ['-e', script, native, filename], { windowsHide: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } }); child.once('error', reject); child.once('exit', resolve); });
    expect(code).toBe(23); expect(store.getSettings().name).toBe('FICTIONAL PILOT MOSQUE');
    expect(store.finance.report({ kind: 'ledger', familyId: '', filters: qaFilters }).totals).toEqual(before);
    expect(store.checkStorage().integrity).toBe('ok');
  }, 20000);
});
