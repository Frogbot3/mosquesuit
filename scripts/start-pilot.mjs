import { access, mkdir, readFile, copyFile, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';
import electron from 'electron';

async function exists(path) { try { await access(path); return true; } catch { return false; } }
async function main() {
  if (!process.env.APPDATA) throw new Error('Windows application data folder is unavailable.');
  const profile = resolve(process.env.APPDATA, 'Mosque Suite Development', 'pilot-demo');
  const filename = join(profile, 'mosque-suite.sqlite3');
  if (!await exists(filename) && !await exists(join(profile, 'active-workspace.json'))) {
    // Only create a new directory; never reuse or reset a partially existing profile.
    if (await exists(profile)) throw new Error('The pilot folder already exists but cannot be opened. Preserve it and ask your administrator to review recovery.');
    const source = resolve('pilot-data/fictional-demo.sqlite3');
    const manifest = JSON.parse(await readFile('pilot-data/manifest.json', 'utf8'));
    if (manifest.fictional !== true || manifest.administratorAccounts !== 0 || manifest.filename !== 'fictional-demo.sqlite3') throw new Error('Invalid fictional pilot manifest.');
    const bytes = await readFile(source);
    if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error('The fictional pilot database checksum did not match.');
    const db = new Database(source, { readonly: true });
    try {
      if (db.pragma('integrity_check', { simple: true }) !== 'ok' || db.prepare('SELECT COUNT(*) n FROM staff_users').get().n !== 0) throw new Error('Pilot fixture validation failed.');
    } finally { db.close(); }
    await mkdir(resolve(process.env.APPDATA, 'Mosque Suite Development'), { recursive: true });
    await mkdir(profile); await copyFile(source, filename, constants.COPYFILE_EXCL);
  }
  if (!(await readdir('dist-electron')).includes('main.cjs')) throw new Error('Run npm.cmd run build first.');
  const env = { ...process.env, MOSQUE_PILOT_DEMO: '1' }; delete env.ELECTRON_RUN_AS_NODE; delete env.MOSQUE_DEV_URL; delete env.MOSQUE_TEST_PROFILE;
  const child = spawn(electron, ['.'], { stdio: 'inherit', windowsHide: false, env });
  child.once('exit', code => process.exit(code ?? 1)); child.once('error', error => { console.error(error.message); process.exitCode = 1; });
}
void main().catch(error => { console.error(error.message); process.exitCode = 1; });
