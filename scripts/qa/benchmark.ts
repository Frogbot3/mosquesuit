import { copyFile, mkdir, mkdtemp, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir, cpus, totalmem, release, arch } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { seedLoadDataset, qaFilters } from '../../tests/fixtures/load-dataset';
import { WorkspaceStore } from '../../electron/database/store';
import { BackupService } from '../../electron/backup-service';
import { activeWorkspace } from '../../electron/workspace-path';
import { createMockIntegrationClient } from '../../electron/integration-client';
import { DEMO_FINANCE_CONFIRMATION as confirmation } from '../../shared/finance';

type Metrics = Record<string, { samplesMs: number[]; medianMs: number; p95Ms: number }>;
const disabledVault = { available: () => false, seal: () => { throw new Error('No saved key in QA'); }, open: () => { throw new Error('No saved key in QA'); } };
function sample(metrics: Metrics, name: string, fn: () => unknown, count = 5) {
  const samplesMs: number[] = [];
  for (let i = 0; i < count; i++) { const t = performance.now(); fn(); samplesMs.push(Math.round((performance.now() - t) * 100) / 100); }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  metrics[name] = { samplesMs, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] };
}
async function timed(metrics: Metrics, name: string, fn: () => Promise<unknown>) {
  const t = performance.now(); await fn(); const ms = Math.round((performance.now() - t) * 100) / 100;
  metrics[name] = { samplesMs: [ms], medianMs: ms, p95Ms: ms };
}
function totals(s: WorkspaceStore) {
  const db = s.security.db;
  const number = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  return { families: number('SELECT COUNT(*) n FROM families'), members: number('SELECT COUNT(*) n FROM members'), dues: number('SELECT COUNT(*) n FROM dues'), payments: number('SELECT COUNT(*) n FROM payments'), receipts: number('SELECT COUNT(*) n FROM receipts'),
    cashPaise: number('SELECT COALESCE(SUM(cash_paise),0) n FROM financial_transactions'), billedPaise: number('SELECT COALESCE(SUM(amount_paise),0) n FROM dues'), allocatedPaise: number('SELECT COALESCE(SUM(amount_paise),0) n FROM payment_allocations'),
    attachments: number('SELECT COUNT(*) n FROM event_documents'), events: number('SELECT COUNT(*) n FROM life_events'), notifications: number('SELECT COUNT(*) n FROM notification_jobs'), audit: number('SELECT COUNT(*) n FROM audit_logs') };
}
async function main() {
  const label = process.argv[2] ?? 'baseline';
  if (!/^[a-z0-9-]{1,30}$/.test(label)) throw new Error('Invalid benchmark label');
  await mkdir('tmp/phase7', { recursive: true });
  const pointer = resolve('tmp/phase7/dataset-root.json');
  let root: string;
  try { root = JSON.parse(await readFile(pointer, 'utf8')).root; }
  catch { root = await mkdtemp(join(tmpdir(), 'mosque-qa-benchmark-')); await writeFile(pointer, JSON.stringify({ root }), { flag: 'wx' }); }
  if (!/^mosque-qa-benchmark-[A-Za-z0-9]+$/.test(relative(resolve(tmpdir()), resolve(root)))) throw new Error('Unsafe QA dataset root');
  const results: unknown[] = [];
  const report = { label, measuredAt: new Date().toISOString(), hardware: { cpu: cpus()[0]?.model, logicalCpus: cpus().length, memoryGiB: Math.round(totalmem() / 2 ** 30 * 10) / 10, windows: release(), arch: arch(), node: process.versions.node, electron: process.versions.electron }, results };
  for (const count of [500, 2000]) {
    const dataset = join(root, String(count)); await mkdir(dataset, { recursive: true });
    const source = join(dataset, 'source.sqlite3');
    let fixture: ReturnType<typeof seedLoadDataset>;
    try { fixture = JSON.parse(await readFile(join(dataset, 'fixture.json'), 'utf8')); }
    catch { console.log(`Generating ${count} fictional families...`); fixture = seedLoadDataset(source, count); await writeFile(join(dataset, 'fixture.json'), JSON.stringify(fixture), { flag: 'wx' }); }
    const work = join(dataset, label); await mkdir(work); // Exclusive run label, never overwrite a previous run.
    const data = join(work, 'original'); await mkdir(data); await copyFile(source, join(data, 'mosque-suite.sqlite3'));
    const metrics: Metrics = {}; let s: WorkspaceStore;
    sample(metrics, 'databaseOpen', () => { s = new WorkspaceStore(join(data, 'mosque-suite.sqlite3'), true, true, true); s.close(); });
    s = new WorkspaceStore(join(data, 'mosque-suite.sqlite3'), true, true, true);
    const password = randomBytes(32).toString('base64url'), secret = randomBytes(32).toString('base64url');
    s.security.bootstrap({ username: 'qa.benchmark', name: 'Fictional benchmark administrator', password, confirmed: true });
    sample(metrics, 'offlineLogin', () => { s.security.logout(); s.security.login({ username: 'qa.benchmark', password }); }, 3);
    const client = await createMockIntegrationClient(join(data, 'integration-service.sqlite3'), s.integrations.workspaceId); s.integrations.attach(client);
    const b = new BackupService(s, data, data, disabledVault, client.snapshot);
    try {
      const query = { search: '000', wardId: '', page: 1, pageSize: 25 };
      sample(metrics, 'dashboardCounts', () => s.registration.counts());
      sample(metrics, 'familySearch', () => s.registration.list(query));
      sample(metrics, 'malayalamSearch', () => s.registration.list({ ...query, search: 'സാങ്കൽപ്പിക' }));
      sample(metrics, 'memberSearch', () => s.registration.listMembers(query));
      sample(metrics, 'familyFinance', () => s.finance.family({ id: fixture.familyId }));
      sample(metrics, 'monthlyDuesGenerate', () => {
        const generated = s.finance.generate({ key: randomUUID(), planId: fixture.planId, from: '2026-12', until: '2026-12', confirmation });
        assert.equal(generated.created, count);
      }, 1);
      sample(metrics, 'monthlyDuesDuplicate', () => assert.equal(s.finance.generate({ key: randomUUID(), planId: fixture.planId, from: '2026-12', until: '2026-12', confirmation }).created, 0), 1);
      sample(metrics, 'financeDashboard', () => s.finance.dashboard(qaFilters));
      sample(metrics, 'monthlyReport', () => s.finance.report({ kind: 'monthly', filters: qaFilters, familyId: '' }));
      sample(metrics, 'outstandingReport', () => s.finance.report({ kind: 'outstanding', filters: qaFilters, familyId: '' }));
      sample(metrics, 'ledgerReport', () => s.finance.report({ kind: 'ledger', filters: qaFilters, familyId: '' }));
      sample(metrics, 'auditPage', () => s.security.auditHistory({ action: '', outcome: '', from: '', until: '', page: 1 }));
      const before = totals(s);
      assert.equal(before.families, count); assert.equal(before.members, count * 5); assert.equal(before.dues, count * 12); assert.equal(before.payments, count * 4);
      assert.equal(before.cashPaise, count * 30000 + 750000); assert.equal(before.billedPaise - before.allocatedPaise, count * 150000);
      assert.equal(s.finance.report({ kind: 'monthly', filters: qaFilters, familyId: '' }).totals.outstandingPaise, count * 150000);
      await b.configure({ password: secret, currentPassword: password, scheduled: false, intervalHours: 24, retain: 3, confirmed: true }, join(work, 'archives'));
      await timed(metrics, 'encryptedBackup', () => b.create(secret));
      const archive = (await b.state()).history.find(h => h.status === 'verified')!.filename;
      const bytes = (await stat(archive)).size;
      // Simulate total loss by withholding the entire original profile. Restore
      // into a brand-new computer/profile; the original is retained for comparison.
      const fresh = join(work, 'replacement'); await mkdir(fresh);
      const replacement = new WorkspaceStore(join(fresh, 'mosque-suite.sqlite3'), true, true, true);
      replacement.security.bootstrap({ username: 'qa.recovery', name: 'Fictional recovery administrator', password, confirmed: true });
      replacement.security.login({ username: 'qa.recovery', password });
      const restore = new BackupService(replacement, fresh, fresh, disabledVault);
      try {
        let previewId = '';
        await timed(metrics, 'restorePreview', async () => { const p = await restore.inspect(archive, secret); previewId = p.id; assert.equal(p.families, count); assert.equal(p.serviceIncluded, true); });
        await timed(metrics, 'restoreActivationWithSafety', () => restore.restore({ previewId, currentPassword: password, confirmation: 'RESTORE VERIFIED BACKUP' }));
        const restored = new WorkspaceStore(join(activeWorkspace(fresh), 'mosque-suite.sqlite3'), true, true, true);
        try {
          restored.security.login({ username: 'qa.benchmark', password });
          const after = totals(restored);
          for (const key of Object.keys(before) as (keyof typeof before)[]) if (key !== 'audit') assert.equal(after[key], before[key], `Restored ${key}`);
          assert.ok(after.audit >= before.audit); assert.equal(restored.security.integrity(), true); assert.equal(restored.checkStorage().integrity, 'ok');
          assert.equal(restored.finance.report({ kind: 'monthly', filters: qaFilters, familyId: '' }).totals.outstandingPaise, count * 150000);
        } finally { restored.close(); }
      } finally { await restore.dispose(); replacement.close(); }
      const row = { families: count, fixture, totals: before, metrics, archiveBytes: bytes, memory: process.memoryUsage(), peakRssKiB: process.resourceUsage().maxRSS, recovery: 'passed', dataset };
      results.push(row);
      await writeFile(resolve(`tmp/phase7/${label}.json`), JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ families: count, metrics, archiveBytes: bytes, recovery: 'passed' }));
    } finally { await b.dispose(); await client.close(); s.close(); }
  }
  console.log(`Results: tmp/phase7/${label}.json`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
