import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative } from 'node:path';
import { authenticate, password, signInAsViewer } from '../fixtures/electron-auth';
let app: ElectronApplication, page: Page, profile: string, data: string, files: string;
const evidence = resolve('docs/phase8-evidence');
test.beforeEach(async () => {
  test.skip(Boolean(process.env.MOSQUE_PACKAGED_EXE)); profile = `test-${randomUUID()}`; files = await mkdtemp(join(tmpdir(), 'mosque-release-e2e-')); await mkdir(evidence, { recursive: true });
  const env = { ...Object.fromEntries(Object.entries(process.env).filter((v): v is [string, string] => v[1] !== undefined)), MOSQUE_TEST_PROFILE: profile, MOSQUE_RELEASE_PREVIEW: '1' }; delete (env as Record<string,string>).ELECTRON_RUN_AS_NODE; delete (env as Record<string,string>).MOSQUE_DEV_URL;
  app = await electron.launch({ args: ['.'], env }); page = await app.firstWindow(); data = await app.evaluate(({ app }) => app.getPath('userData')); await authenticate(app, page);
});
test.afterEach(async () => {
  if (app) { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.destroy())).catch(() => {}); await app.close(); }
  if (relative(resolve(process.env.APPDATA!, 'Mosque Suite Development'), data) !== profile || !/^mosque-release-e2e-[A-Za-z0-9]+$/.test(relative(resolve(tmpdir()), files))) throw new Error('Unsafe cleanup');
  await rm(data, { recursive: true, force: true }); await rm(files, { recursive: true, force: true });
});
async function capture(name: string) { await page.evaluate(() => window.scrollTo(0,0)); await page.screenshot({ path: join(evidence, name), fullPage: true }); }
test('first-run configuration, reviewed import, real backup, family PDF and safe diagnostics work offline', async () => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.context().setOffline(true); await expect(page.getByRole('heading', { name: 'Mosque setup', exact: true })).toBeVisible();
  await page.getByLabel('Mosque name (English)').fill('Fictional Crescent Mosque'); await page.getByLabel('Mosque name (Malayalam)').fill('മാതൃകാ പള്ളി'); await page.getByLabel('Address', { exact: true }).fill('Fictional Lane, Kerala'); await page.getByLabel('Contact phone').fill('9000000001'); await page.getByLabel('Receipt prefix').fill('TEST'); await page.getByLabel('Financial year starting month (1–12)').fill('1');
  await capture('setup.png'); expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);
  await page.getByLabel('Your login password').fill(password); await page.getByLabel('I reviewed these settings.').check(); await page.getByRole('button', { name: 'Save configuration' }).click(); await expect(page.getByRole('heading', { name: 'A place for every family.' })).toBeVisible();
  await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, join(files, 'backups'));
  expect(await page.evaluate(async ({ password }) => window.mosque!.configureBackups({ password: 'Fictional release backup 123!', currentPassword: password, scheduled: false, intervalHours: 24, retain: 3, confirmed: true }), { password })).toEqual({ ok: true, data: true });
  const csv = join(files, 'Fictional-Import.csv'); await writeFile(csv, 'wardCode,wardName,familyNumber,memberName,memberNameMl,relationship,dob,phone\nW1,Ward 1,IMP1,Fictional Guardian,മാതൃകാ അമീൻ,guardian,1980-01-01,9000000001\nW1,Ward 1,IMP1,Fictional Member,മാതൃകാ സഫിയ,spouse,1990-01-01,\n');
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, csv);
  await page.getByRole('link', { name: 'Import existing records', exact: true }).click(); await page.getByRole('button', { name: '1. Select CSV / XLSX' }).click(); await expect(page.getByText('Fictional-Import.csv', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '3. Validate and preview' }).click(); await expect(page.getByText('Families: 1 · Members: 2 · New wards: 0')).toBeVisible();
  await capture('import-preview.png'); expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze()).violations).toEqual([]);
  await page.getByLabel('Your login password').fill(password); await page.getByLabel('Encrypted backup passphrase (12+ characters)').fill('Fictional release backup 123!'); await page.getByLabel('Type IMPORT VERIFIED RECORDS').fill('IMPORT VERIFIED RECORDS'); await page.getByLabel('I verified the preview, warnings and approved source records.').check(); await page.getByRole('button', { name: '4. Back up and import' }).click(); await expect(page.getByRole('status').filter({ hasText: 'Import completed' })).toBeVisible();
  const family = await page.evaluate(async () => { const r = await window.mosque!.listFamilies({ search: 'IMP1', wardId: '', page: 1, pageSize: 10 }); if (!r.ok) throw new Error(r.error.code); return r.data.items[0]; });
  const pdf = join(evidence, 'fictional-family.pdf'); await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, pdf);
  await page.goto(`app://mosque/index.html#/families/${family.id}`); await page.getByRole('button', { name: 'Preview / save family PDF' }).click(); await expect(page.getByRole('button', { name: 'Preview / save family PDF' })).toBeEnabled(); expect((await readFile(pdf)).subarray(0,5).toString()).toBe('%PDF-');
  await page.goto('app://mosque/index.html#/about'); await expect(page.getByText('0.8.0-rc.1', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Check for updates' }).click(); await expect(page.getByText('Trusted update source not configured')).toBeVisible(); await capture('about.png');
  const diagnostic = join(evidence, 'diagnostics.json'); await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, diagnostic); expect(await page.evaluate(() => window.mosque!.exportDiagnostics())).toEqual({ ok: true, data: true }); const report = await readFile(diagnostic, 'utf8'); expect(report).not.toContain('Fictional'); expect(report).not.toContain('9000000001');
  const saved = await page.evaluate(async () => { const r = await window.mosque!.getSnapshot(); if (!r.ok) throw new Error(r.error.code); return r.data; }); expect(saved).toMatchObject({ setupRequired: false, financialYearStart: 1, schemaVersion: 7, integrationsDemo: false, registryCounts: { families: 1, livingMembers: 2 } });
  await signInAsViewer(page); expect(await page.evaluate(() => window.mosque!.selectImportFile())).toMatchObject({ ok: false, error: { code: 'AUTH_PERMISSION' } }); expect(await page.evaluate(() => window.mosque!.exportDiagnostics())).toMatchObject({ ok: false, error: { code: 'AUTH_PERMISSION' } }); expect(errors).toEqual([]);
});
test('invalid import rows stay unwritten and cancellation discards the preview', async () => {
  const state = await page.evaluate(() => window.mosque!.getDeploymentSettings()); if (!state.ok) throw new Error(state.error.code);
  expect(await page.evaluate(({ state, password }) => window.mosque!.saveDeploymentSettings({ revision: state.revision, name: 'Fictional release', nameMl: '', address: 'Fictional street', contact: '9000000000', email: '', locale: 'en', receiptPrefix: 'TEST', financialYearStart: 4, wards: state.wards, currentPassword: password, confirmed: true }), { state: state.data, password })).toMatchObject({ ok: true });
  const file = join(files, 'bad.csv'); await writeFile(file, 'wardCode,familyNumber,memberName,relationship,dob,phone\nW1,ERROR,Fictional invalid,guardian,2020-02-31,abc'); await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, file);
  await page.goto('app://mosque/index.html#/imports'); await page.getByRole('button', { name: '1. Select CSV / XLSX' }).click(); await page.getByRole('button', { name: '3. Validate and preview' }).click(); await expect(page.getByRole('button', { name: '4. Back up and import' })).toBeDisabled(); await expect(page.getByText('invalidDate', { exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Cancel import' }).click(); await expect(page.getByRole('button', { name: '3. Validate and preview' })).toHaveCount(0); expect(await page.evaluate(() => window.mosque!.getSnapshot())).toMatchObject({ ok: true, data: { registryCounts: { families: 0 } } });
});
