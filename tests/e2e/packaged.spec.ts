import { test, expect, _electron as electron } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { rm } from 'node:fs/promises';
import { authenticate } from '../fixtures/electron-auth';

test('packaged Windows executable authenticates offline and refuses development reset', async () => {
  test.skip(!process.env.MOSQUE_PACKAGED_EXE, 'Build the Windows package and run npm run test:packaged.');
  const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE;
  const profile = `test-${randomUUID()}`;
  const root = resolve(process.env.APPDATA!, 'Mosque Suite Package QA');
  const userData = resolve(root, profile);
  if (relative(root, userData) !== profile) throw new Error('Unsafe QA path');
  const app = await electron.launch({ executablePath: process.env.MOSQUE_PACKAGED_EXE, args: [`--qa-profile=${profile}`], env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading').first()).toBeVisible();
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    expect(await app.evaluate(({ app }) => app.getPath('userData'))).toBe(userData);
    expect(await page.evaluate(() => window.mosque!.getSnapshot())).toMatchObject({ ok: false });
    await page.context().setOffline(true); await authenticate(app, page);
    expect(await page.evaluate(() => window.mosque!.getSnapshot())).toMatchObject({ ok: true, data: { environment: 'preview', canResetDemo: false, schemaVersion: 7, lifeEventsDemo: true, integrationsDemo: false, setupRequired: true } });
    expect(await page.evaluate(() => window.mosque!.checkStorage())).toMatchObject({ ok: true, data: { integrity: 'ok', foreignKeys: true } });
    expect(await page.evaluate(() => window.mosque!.resetDemo({ confirmation: 'RESET DEMO' }))).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    await page.context().setOffline(true); await page.reload();
    await expect(page.getByRole('heading').first()).toBeVisible();
  } finally { await app.close(); await rm(userData, { recursive: true, force: true }); }
});
