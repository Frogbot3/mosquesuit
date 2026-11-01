import { access, cp, mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const allowed = ['package.json', 'package-lock.json', '.npmrc', 'README.md', 'index.html', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', 'playwright.load.config.ts', 'eslint.config.mjs', 'Open-Mosque-Pilot.cmd', 'Open-Mosque-Security.cmd', 'Open-Mosque-Integrations.cmd', 'Open-Mosque-Finance.cmd',
  'src', 'shared', 'electron', 'service', 'scripts', 'tests', 'docs', 'dist', 'dist-electron', 'dist-service', 'pilot-data'];
for (const item of allowed) await access(item);
const sourceManifest = JSON.parse(await readFile('pilot-data/manifest.json', 'utf8'));
if (!sourceManifest.fictional || sourceManifest.administratorAccounts !== 0) throw new Error('Pilot dataset must be fictional and contain no staff accounts');
await mkdir('release', { recursive: true });
const folder = await mkdtemp(resolve('release/phase7-evaluation-'));
for (const item of allowed) await cp(resolve(item), join(folder, item), { recursive: true, errorOnExist: true, force: false, dereference: false });
await writeFile(join(folder, 'START-HERE.txt'), 'Mosque Suite 0.7.0 — FICTIONAL EVALUATION ONLY\r\n\r\nThis is a source-based kit, not a verified installer.\r\nInstall Node.js 24.18+ within the 24.x series, run npm.cmd ci, then npm.cmd run build.\r\nOpen Open-Mosque-Pilot.cmd. Create your own administrator; no shared password is supplied.\r\nRead docs/PHASE-7-PILOT.md and docs/PHASE-7-QUICKSTART-ML.md.\r\nDo not import real records or activate live messaging/payments.\r\n', { flag: 'wx' });
const files = [];
async function inventory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Evaluation kit cannot contain symbolic links');
    if (entry.isDirectory()) await inventory(path);
    else files.push({ path: relative(folder, path).replaceAll('\\', '/'), sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
  }
}
await inventory(folder);
await writeFile(join(folder, 'KIT-MANIFEST.json'), JSON.stringify({ version: '0.7.0', fictionalOnly: true, standaloneInstaller: false, generatedAt: new Date().toISOString(), files }, null, 2), { flag: 'wx' });
console.log(folder);
