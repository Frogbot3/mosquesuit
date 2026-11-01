import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { seedLoadDataset } from '../../tests/fixtures/load-dataset';
async function main() {
const size = Number(process.argv[2] ?? 500);
if (![20, 500, 2000].includes(size)) throw new Error('Choose 20, 500 or 2000 fictional families');
const root = await mkdtemp(join(tmpdir(), 'mosque-pilot-fictional-'));
const result = seedLoadDataset(join(root, 'mosque-suite.sqlite3'), size);
await writeFile(join(root, 'FICTIONAL-QA.json'), JSON.stringify({ ...result, createdAt: new Date().toISOString(), fictional: true }, null, 2), { flag: 'wx' });
console.log(JSON.stringify({ root, ...result }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
