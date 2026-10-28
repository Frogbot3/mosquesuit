import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';

let app: ElectronApplication;
let page: Page;
let profile: string;
let userData: string;
let errors: string[];

test.beforeEach(async () => {
  test.skip(Boolean(process.env.MOSQUE_PACKAGED_EXE), 'Use the packaged smoke suite for installed builds.');
  profile = `test-${randomUUID()}`;
  userData = '';
  errors = [];
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), MOSQUE_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.MOSQUE_DEV_URL;
  app = await electron.launch({ args: ['.'], env });
  page = await app.firstWindow();
  errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await expect(page.getByRole('heading', { name: 'A place for every family.' })).toBeVisible();
  userData = await app.evaluate(({ app }) => app.getPath('userData'));
});
test.afterEach(async () => {
  if (!app) return;
  await app.close();
  if (userData) {
    const root = resolve(process.env.APPDATA!, 'Mosque Suite Development');
    // Delete only the exact unique fixture directory allocated by this test.
    if (relative(root, userData) !== profile || !profile.startsWith('test-')) throw new Error('Refusing unsafe fixture cleanup');
    await rm(userData, { recursive: true, force: true });
  }
  expect(errors).toEqual([]);
});

test('loads local assets offline and enforces the Electron boundary', async () => {
  await expect(page).toHaveTitle('Mosque Suite');
  expect(page.url()).toBe('app://mosque/index.html');
  expect(userData).toContain(join('Mosque Suite Development', profile));
  const preferences = await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents as unknown as { getLastWebPreferences: () => Record<string, boolean> };
    const preferences = contents.getLastWebPreferences();
    return { sandbox: preferences.sandbox, isolation: preferences.contextIsolation, node: preferences.nodeIntegration, webSecurity: preferences.webSecurity };
  });
  expect(preferences).toEqual({ sandbox: true, isolation: true, node: false, webSecurity: true });
  expect(await page.evaluate(() => ({ node: typeof (window as unknown as { require: unknown }).require, bridge: Object.keys(window.mosque!) }))).toEqual({ node: 'undefined', bridge: ['getFinanceSetup','setFinanceDemoRole','saveFinancePlan','saveFinanceAssignment','saveFinancePolicy','generateFinanceDues','getFamilyFinance','recordFinancePayment','applyFinanceCredit','adjustFinanceDue','correctFinanceTransaction','saveFinanceFund','saveFinanceCategory','recordFinanceDonation','recordFinanceExpense','decideFinanceExpense','getFinanceDashboard','getFinanceReport','getFinanceTransaction','getFinanceReceipt','getFinanceAudit','saveFinanceConfig','chooseFinanceLogo','outputFinanceDocument','backupFinance','getSnapshot', 'saveSettings', 'checkStorage', 'resetDemo', 'listFamilies', 'getFamily', 'saveFamily', 'listMembers', 'getMember', 'listEvents', 'getEvent', 'saveEvent', 'transitionEvent', 'getEventCategories', 'saveEventCategory', 'transferMember', 'getTransfers', 'attachEventDocument', 'exportEventDocument', 'outputEvent'] });
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A place for every family.' })).toBeVisible();
  const health = await page.evaluate(() => window.mosque!.checkStorage());
  expect(health).toMatchObject({ ok: true, data: { integrity: 'ok', foreignKeys: true, journalMode: 'wal' } });
  const snapshot = await page.evaluate(() => window.mosque!.getSnapshot());
  if (!snapshot.ok) throw new Error('Snapshot failed');
  const invalid = await page.evaluate(settings => window.mosque!.saveSettings({ ...settings, name: '' }), snapshot.data.settings);
  expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  expect(await page.evaluate(() => window.open('https://example.com'))).toBeNull();
  expect(app.windows()).toHaveLength(1);
});

test('saves Malayalam settings and retains them after a real application restart', async () => {
  await page.getByRole('link', { name: 'Configure mosque' }).click();
  await page.getByLabel('Mosque name (English)').fill('Fictional Crescent Mosque');
  await page.getByLabel('Mosque name (Malayalam)').fill('മാതൃകാ പള്ളി');
  await page.getByLabel('Address', { exact: false }).fill('സാങ്കൽപ്പിക വിലാസം, കേരളം');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Settings saved' })).toBeVisible();
  await app.close();
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), MOSQUE_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE; delete env.MOSQUE_DEV_URL;
  app = await electron.launch({ args: ['.'], env }); page = await app.firstWindow();
  await page.getByRole('link', { name: 'Configure mosque' }).click();
  await expect(page.getByLabel('Mosque name (English)')).toHaveValue('Fictional Crescent Mosque');
  await expect(page.getByLabel('Mosque name (Malayalam)')).toHaveValue('മാതൃകാ പള്ളി');
  await expect(page.getByLabel('Address', { exact: false })).toHaveValue('സാങ്കൽപ്പിക വിലാസം, കേരളം');
  await page.getByRole('link', { name: 'Audit History', exact: true }).click();
  await expect(page.getByText('Mosque settings updated', { exact: true })).toBeVisible();
  await expect(page.getByText('Local preview · no staff account').first()).toBeVisible();
});

test('validates settings, confirms unsaved navigation, and protects reset behind confirmation', async () => {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  const name = page.getByLabel('Mosque name (English)'); await name.fill('');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Enter at least 2 characters.')).toBeVisible();
  await name.fill('Temporary fictional name');
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(name).toHaveValue('Temporary fictional name');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Reset demo settings', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(name).toHaveValue('Temporary fictional name');
  await page.getByRole('button', { name: 'Reset demo settings', exact: true }).click();
  await page.getByRole('button', { name: 'Reset settings', exact: true }).click();
  await expect(name).toHaveValue('Demo Mosque');
  await page.getByRole('button', { name: 'Check database' }).click();
  await expect(page.getByText('Database checks passed.')).toBeVisible();
});

test('searches Malayalam wards and switches language and appearance', async () => {
  await page.getByRole('link', { name: 'Wards', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search wards' }).fill('വാർഡ് 3');
  await expect(page.getByRole('cell', { name: 'Ward 3', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Ward 1', exact: true })).toHaveCount(0);
  await page.getByRole('searchbox').fill('missing');
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByRole('cell', { name: 'Ward 1', exact: true })).toBeVisible();
  await page.getByLabel('Language', { exact: true }).selectOption('ml');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ml');
  await expect(page.getByRole('heading', { name: 'ഒന്നിച്ചൊരു സമൂഹം.' })).toBeVisible();
  expect(await page.evaluate(() => document.fonts.check('16px "Noto Sans Malayalam"'))).toBe(true);
  await page.getByRole('button', { name: 'രൂപഭാവം മാറ്റുക' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ml');
});

test('asks before closing a window with unsaved settings', async () => {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Mosque name (English)').fill('Unsaved fictional mosque');
  await app.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBoxSync = (first: unknown, second?: { message: string }) => {
      (globalThis as unknown as { closePrompt: string }).closePrompt = (second ?? first as { message: string }).message;
      return 0; // Simulate the user's Keep editing choice in the native dialog.
    };
    BrowserWindow.getAllWindows()[0].close();
  });
  await expect.poll(() => app.evaluate(() => (globalThis as unknown as { closePrompt?: string }).closePrompt)).toBe('Leave without saving?');
  await expect(page.getByLabel('Mosque name (English)')).toHaveValue('Unsaved fictional mosque');
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
});

test('has accessible light and dark screens with no viewport overflow', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1536, 1024));
  await page.screenshot({ path: join(tmpdir(), 'mosque-suite-dashboard.png'), fullPage: true, scale: 'css' });
  for (const route of ['/', '/wards', '/settings', '/activity']) {
    await page.goto(`app://mosque/index.html#${route}`);
    await expect(page.locator('h1')).toBeVisible();
    // Electron cannot create the extra target used by axe's cross-frame collector.
    // This app has no frames; legacy mode runs the same checks in the current page.
    const results = await new AxeBuilder({ page }).setLegacyMode().withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
  }
  await page.goto('app://mosque/index.html#/');
  await page.getByRole('button', { name: 'Switch color theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await new AxeBuilder({ page }).setLegacyMode().withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: join(tmpdir(), 'mosque-suite-dark.png'), fullPage: true, scale: 'css' });
  await page.getByRole('button', { name: 'Switch color theme' }).click();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 720));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), 'mosque-suite-compact.png'), fullPage: true, scale: 'css' });
  // The supported desktop minimum is 980px. Exercise the CSS compact layout too.
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), 'mosque-suite-mobile-layout.png'), fullPage: true, scale: 'css' });
});
