import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { fictionalFamily } from '../fixtures/registration';
import { profileToDraft } from '../../shared/registration';

let app: ElectronApplication | undefined; let page: Page; let profile: string; let userData: string; let errors: string[];
async function launch() {
  const env: Record<string, string> = { ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)), MOSQUE_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.MOSQUE_DEV_URL;
  app = await electron.launch({ args: ['.'], env }); page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await expect(page.getByRole('heading', { name: 'A place for every family.' })).toBeVisible();
  userData = await app.evaluate(({ app }) => app.getPath('userData'));
}
test.beforeEach(async () => {
  test.skip(Boolean(process.env.MOSQUE_PACKAGED_EXE), 'Use the packaged smoke suite for installed builds.');
  profile = `test-${randomUUID()}`; userData = ''; errors = []; app = undefined; await launch();
});
test.afterEach(async () => {
  // A failed test may leave a dirty form. Destroy only this test application's
  // windows so a native confirmation cannot stall isolated fixture cleanup.
  if (app) await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.destroy(); }).catch(() => {});
  await app?.close();
  if (userData) {
    const root = resolve(process.env.APPDATA!, 'Mosque Suite Development');
    if (relative(root, userData) !== profile || !/^test-[\da-f-]{36}$/.test(profile)) throw new Error('Refusing unsafe fixture cleanup');
    await rm(userData, { recursive: true, force: true });
  }
  expect(errors).toEqual([]);
});
async function seed(draft = fictionalFamily()) {
  const result = await page.evaluate(input => window.mosque!.saveFamily(input), draft);
  if (!result.ok) throw new Error(`Fixture save failed: ${result.error.code}`);
  return result.data;
}
async function createUsingUi() {
  const draft = fictionalFamily();
  await page.getByRole('link', { name: 'Families', exact: true }).click();
  await page.getByRole('link', { name: 'Add family', exact: true }).first().click();
  await page.getByLabel('Family number', { exact: false }).fill(draft.familyNumber);
  for (const [label, value] of [['House name (English)', draft.houseName], ['House name (Malayalam)', draft.houseNameMl], ['House number', draft.houseNumber], ['Address', draft.address], ['Postal code', draft.postalCode]]) await page.getByLabel(label, { exact: true }).fill(value);
  for (let index = 0; index < draft.members.length; index++) {
    if (index) await page.getByRole('button', { name: 'Add member', exact: true }).click();
    const member = draft.members[index]; const region = page.getByRole('region', { name: `Member ${index + 1}`, exact: true });
    await region.getByLabel('Full name (English)', { exact: true }).fill(member.name);
    await region.getByLabel('Full name (Malayalam)', { exact: true }).fill(member.nameMl);
    await region.getByLabel('Gender', { exact: true }).selectOption(member.gender);
    if (index) await region.getByLabel('Relationship to guardian', { exact: true }).selectOption(member.relationship);
    if (member.dob) await region.getByLabel('Date of birth', { exact: true }).fill(member.dob);
    if (member.phone) await region.getByLabel('Phone number', { exact: true }).fill(member.phone);
  }
  await expect(page.getByText('Living members: 4', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save family', exact: true }).click();
  await expect(page.getByRole('heading', { name: draft.houseName, exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Household members' }).locator('tbody tr')).toHaveCount(4);
  return (await page.evaluate(() => window.mosque!.listFamilies({ search: 'W1/001', wardId: '', page: 1, pageSize: 10 })));
}

test('registers a guardian and three members, restarts, edits, and searches persisted bilingual records', async () => {
  test.setTimeout(90_000);
  const listed = await createUsingUi(); if (!listed.ok) throw new Error('List failed'); const id = listed.data.items[0].id;
  await app!.close(); app = undefined; await launch();
  await page.getByRole('link', { name: 'Families', exact: true }).click();
  for (const search of ['Fictional Ameen', '001', 'മാതൃകാ വീട്', '9000000001']) {
    await page.getByRole('searchbox', { name: 'Search families' }).fill(search);
    await expect(page.getByRole('link', { name: 'W1/001', exact: true })).toBeVisible();
  }
  await page.getByRole('link', { name: 'W1/001', exact: true }).click();
  const memberRow = page.getByRole('table', { name: 'Household members' }).getByRole('row').filter({ hasText: 'Fictional Safiya' });
  await expect(memberRow).toContainText('മാതൃകാ സഫിയ');
  await memberRow.getByRole('link', { name: 'Edit', exact: true }).click();
  await page.getByRole('region', { name: 'Member 2', exact: true }).getByLabel('Occupation', { exact: true }).fill('Fictional teacher');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fictional Green House', exact: true })).toBeVisible();
  await app!.close(); app = undefined; await launch(); await page.context().setOffline(true);
  await page.getByRole('link', { name: 'Members', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search members' }).fill('സഫിയ');
  await page.getByRole('link', { name: 'Fictional Safiya മാതൃകാ സഫിയ' }).click();
  await expect(page.getByText('Fictional teacher', { exact: true })).toBeVisible();
  const family = await page.evaluate(id => window.mosque!.getFamily({ id }), id);
  expect(family).toMatchObject({ ok: true, data: { totals: { living: 4, male: 2, female: 2 }, revision: 1 } });
  expect(await page.evaluate(() => window.mosque!.checkStorage())).toMatchObject({ ok: true, data: { integrity: 'ok', foreignKeys: true, schemaVersion: 4 } });
});

test('rejects duplicate and invalid registration input while preserving saved data and the unsaved form', async () => {
  const family = await seed();
  await page.getByRole('link', { name: 'Families', exact: true }).click(); await page.getByRole('link', { name: 'Add family', exact: true }).first().click();
  await page.getByLabel('Family number', { exact: false }).fill('001');
  await page.getByLabel('Full name (Malayalam)', { exact: true }).fill('മാതൃകാ പേര്');
  await page.getByLabel('Phone number', { exact: true }).fill('abc');
  await page.getByRole('button', { name: 'Save family' }).click();
  await expect(page.getByText('Use a phone number with 7–15 digits, or leave it blank.')).toBeVisible();
  await page.getByLabel('Phone number', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save family' }).click();
  await expect(page.getByText('This family number already exists in that ward. Choose another number.')).toBeVisible();
  await page.getByRole('link', { name: 'Families', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Leave without saving?' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep editing' }).click();
  await expect(page.getByLabel('Full name (Malayalam)', { exact: true })).toHaveValue('മാതൃകാ പേര്');
  const invalid = { ...profileToDraft(family), members: profileToDraft(family).members.map((member, index) => ({ ...member, dob: index ? member.dob : '2099-01-01' })) };
  expect(await page.evaluate(input => window.mosque!.saveFamily(input), invalid)).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
  expect(await page.evaluate(id => window.mosque!.getFamily({ id }), family.id)).toMatchObject({ ok: true, data: { revision: family.revision, totals: { living: 4 } } });
  await page.getByRole('link', { name: 'Families', exact: true }).click(); await page.getByRole('button', { name: 'Discard and leave' }).click();
  await expect(page.getByRole('heading', { name: 'Your families, together.' })).toBeVisible();
});

test('confirms guardian replacement and member removal and retains historical records', async () => {
  const family = await seed(); await page.goto(`app://mosque/index.html#/families/${family.id}/edit`);
  const first = page.getByRole('region', { name: 'Member 1', exact: true });
  await expect(first.getByRole('button', { name: 'Remove member 1' })).toBeDisabled();
  await page.getByRole('region', { name: 'Member 2', exact: true }).getByRole('button', { name: 'Edit details' }).click();
  await page.getByRole('region', { name: 'Member 2', exact: true }).getByRole('button', { name: 'Set as guardian' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Change guardian' }).click();
  await expect(first).toContainText('Fictional Safiya');
  const former = page.getByRole('region', { name: 'Member 2', exact: true });
  await former.getByRole('button', { name: 'Remove member 2' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click(); await expect(former).toContainText('Fictional Ameen');
  await former.getByRole('button', { name: 'Remove member 2' }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Remove member', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Household members' }).locator('tbody tr')).toHaveCount(3);
  await expect(page.getByText('Guardian changed', { exact: true })).toBeVisible();
  await page.locator('summary', { hasText: 'Retained removed-member records' }).click();
  await expect(page.locator('.removed-records').getByRole('link', { name: 'Fictional Ameen' })).toBeVisible();
  await page.locator('.removed-records').getByRole('link', { name: 'Fictional Ameen' }).click();
  await expect(page.getByText('Removed from household', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit member' })).toHaveCount(0);
});

test('keeps stale edits for review and allows an explicit reload of the newer saved family', async () => {
  const family = await seed(); await page.goto(`app://mosque/index.html#/families/${family.id}/edit`);
  await page.getByLabel('House number', { exact: true }).fill('Unsaved number');
  await seed({ ...profileToDraft(family), houseNumber: 'Newer saved number' });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText(/This family has changed since you opened it/)).toBeVisible();
  await expect(page.getByLabel('House number', { exact: true })).toHaveValue('Unsaved number');
  await page.getByRole('button', { name: 'Reload saved family', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reload saved family', exact: true }).click();
  await expect(page.getByLabel('House number', { exact: true })).toHaveValue('Newer saved number');
});

test('paginates and filters directories and prompts before closing an unsaved family', async () => {
  for (let index = 1; index <= 12; index++) await seed(fictionalFamily(String(index).padStart(3, '0'), index === 12 ? 'ward-2' : 'ward-1'));
  await page.getByRole('link', { name: 'Families', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Families', exact: true }).locator('tbody tr')).toHaveCount(10);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('table', { name: 'Families', exact: true }).locator('tbody tr')).toHaveCount(2);
  await page.getByLabel('Ward', { exact: true }).selectOption('ward-2');
  await expect(page.getByRole('link', { name: 'W2/012', exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Families', exact: true }).locator('tbody tr')).toHaveCount(1);
  await page.getByRole('link', { name: 'Edit W2/012', exact: true }).click();
  await page.getByLabel('House number', { exact: true }).fill('Unsaved');
  await app!.evaluate(({ dialog, BrowserWindow }) => {
    dialog.showMessageBoxSync = (first: unknown, second?: { detail?: string }) => { (globalThis as unknown as { closeDetail: string }).closeDetail = (second ?? first as { detail?: string }).detail ?? ''; return 0; };
    BrowserWindow.getAllWindows()[0].close();
  });
  await expect.poll(() => app!.evaluate(() => (globalThis as unknown as { closeDetail?: string }).closeDetail)).toBe('Your unsaved changes will be discarded.');
  await expect(page.getByLabel('House number', { exact: true })).toHaveValue('Unsaved');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await page.getByRole('dialog').getByRole('button', { name: 'Discard and leave' }).click();
});

test('keeps the registration screens accessible in English, Malayalam, dark and compact layouts', async () => {
  test.setTimeout(90_000);
  const family = await seed();
  const paths = ['/families', '/members', `/families/${family.id}`, `/members/${family.members[0].id}`, `/families/${family.id}/edit`];
  for (const route of paths) {
    await page.goto(`app://mosque/index.html#${route}`); await expect(page.locator('h1')).toBeVisible();
    const results = await new AxeBuilder({ page }).setLegacyMode().withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(results.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
  }
  await page.screenshot({ path: join(tmpdir(), 'mosque-suite-family-form.png'), fullPage: true, scale: 'css' });
  await page.getByLabel('Language', { exact: true }).selectOption('ml');
  await expect(page.getByRole('heading', { name: 'കുടുംബം തിരുത്തുക' })).toBeVisible();
  await page.getByRole('button', { name: 'രൂപഭാവം മാറ്റുക' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect((await new AxeBuilder({ page }).setLegacyMode().withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
  await app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1000, 720));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), 'mosque-suite-registration-ml-dark.png'), fullPage: true, scale: 'css' });
  await page.goto(`app://mosque/index.html#/families/${family.id}`); await expect(page.locator('h1')).toHaveText('മാതൃകാ വീട്');
  await page.screenshot({ path: join(tmpdir(), 'mosque-suite-family-profile.png'), fullPage: true, scale: 'css' });
});
