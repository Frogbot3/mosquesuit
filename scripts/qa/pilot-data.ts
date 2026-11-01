import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { FinanceStore } from '../../electron/database/finance-store';
import { DEMO_FINANCE_CONFIRMATION as confirmation } from '../../shared/finance';
import { seedLoadDataset } from '../../tests/fixtures/load-dataset';
async function main() {
  const destination = resolve('pilot-data');
  await mkdir(destination); // No overwrite: a regenerated bundle gets a new directory.
  const target = join(destination, 'fictional-demo.sqlite3');
  let schemaVersion: number;
  let meta: ReturnType<typeof seedLoadDataset>;
  const pointer = resolve('tmp/phase7/dataset-root.json');
  try {
    const { root } = JSON.parse(await readFile(pointer, 'utf8')) as { root: string };
    if (!/^mosque-qa-benchmark-[A-Za-z0-9]+$/.test(relative(resolve(tmpdir()), resolve(root)))) throw new Error('Unsafe QA source');
    meta = JSON.parse(await readFile(join(root, '500', 'fixture.json'), 'utf8'));
    await copyFile(join(root, '500', 'source.sqlite3'), target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    meta = seedLoadDataset(target, 500);
  }
  const db = new Database(target);
  try {
    db.pragma('foreign_keys=ON');
    if ((db.prepare('SELECT COUNT(*) n FROM staff_users').get() as { n: number }).n) throw new Error('Fixture must not ship staff credentials');
    new FinanceStore(db, true).generate({ key: randomUUID(), planId: meta.planId, from: '2026-12', until: '2026-12', confirmation });
    if (db.pragma('integrity_check', { simple: true }) !== 'ok' || (db.pragma('foreign_key_check') as unknown[]).length) throw new Error('Invalid fixture');
    schemaVersion = (db.prepare('SELECT MAX(version) AS n FROM schema_migrations').get() as { n: number }).n;
    db.pragma('wal_checkpoint(TRUNCATE)'); db.pragma('journal_mode=DELETE');
  } finally { db.close(); }
  const bytes = await readFile(target);
  const manifest = { fictional: true, filename: 'fictional-demo.sqlite3', families: 500, members: 2500, months: 12, payments: 2000, administratorAccounts: 0, schemaVersion,
    sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, generatedAt: new Date().toISOString() };
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(manifest));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
