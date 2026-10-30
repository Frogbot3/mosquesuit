import { test, expect, _electron as electron } from '@playwright/test';

test('packaged Windows executable opens SQLite and refuses development reset', async () => {
  test.skip(!process.env.MOSQUE_PACKAGED_EXE, 'Build the Windows package and run npm run test:packaged.');
  const env: Record<string, string> = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)); delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: process.env.MOSQUE_PACKAGED_EXE, env });
  try {
    const page = await app.firstWindow();
    await expect(page.getByRole('heading').first()).toBeVisible();
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    expect(await page.evaluate(() => window.mosque!.getSnapshot())).toMatchObject({ ok: true, data: { environment: 'preview', canResetDemo: false, schemaVersion: 5, lifeEventsDemo: false } });
    expect(await page.evaluate(() => window.mosque!.checkStorage())).toMatchObject({ ok: true, data: { integrity: 'ok', foreignKeys: true } });
    expect(await page.evaluate(() => window.mosque!.resetDemo({ confirmation: 'RESET DEMO' }))).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
    await page.context().setOffline(true); await page.reload();
    await expect(page.getByRole('heading').first()).toBeVisible();
  } finally { await app.close(); }
});
