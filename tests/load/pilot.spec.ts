import { test, expect, _electron as electron } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { copyFile, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { authenticate } from '../fixtures/electron-auth';
import { qaFilters } from '../fixtures/load-dataset';
import { financeText } from '../../shared/finance-labels';

const sizes = process.env.MOSQUE_QA_SIZE ? [Number(process.env.MOSQUE_QA_SIZE)] : [500, 2000];
for (const size of sizes) test(`offline pilot workload with ${size} families and ${size * 5} members`, async () => {
  if (![500, 2000].includes(size)) throw new Error('Invalid QA size');
  const { root } = JSON.parse(await readFile(resolve('tmp/phase7/dataset-root.json'), 'utf8')) as { root: string };
  if (!/^mosque-qa-benchmark-[A-Za-z0-9]+$/.test(relative(resolve(tmpdir()), resolve(root)))) throw new Error('Unsafe dataset root');
  const profile = `test-${randomUUID()}`;
  const userData = resolve(process.env.APPDATA!, 'Mosque Suite Development', profile);
  if (relative(resolve(process.env.APPDATA!, 'Mosque Suite Development'), userData) !== profile || !/^test-[\da-f-]{36}$/.test(profile)) throw new Error('Unsafe fixture path');
  await mkdir(userData); await copyFile(join(root, String(size), 'source.sqlite3'), join(userData, 'mosque-suite.sqlite3'));
  const evidence = join(tmpdir(), 'mosque-phase7-evidence'); await mkdir(evidence, { recursive: true });
  const errors: string[] = [], metrics: Record<string, unknown> = { families: size, members: size * 5 };
  const env = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE; delete env.MOSQUE_DEV_URL; env.MOSQUE_TEST_PROFILE = profile;
  let started = performance.now(); const app = await electron.launch({ args: ['.'], env });
  try {
    const page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible(); metrics.coldProcessLaunchMs = Math.round(performance.now() - started);
    expect(page.url()).toBe('app://mosque/index.html'); expect(await page.title()).toBe('Mosque Suite');
    await page.context().setOffline(true); await authenticate(app, page);
    started = performance.now(); await expect(page.getByRole('heading', { name: 'A place for every family.' })).toBeVisible(); metrics.dashboardAfterLoginMs = Math.round(performance.now() - started);
    started = performance.now(); await page.goto('app://mosque/index.html#/families');
    await expect(page.locator('tbody tr')).toHaveCount(10); metrics.familyDirectoryMs = Math.round(performance.now() - started);
    started = performance.now(); await page.goto('app://mosque/index.html#/members');
    await expect(page.locator('tbody tr')).toHaveCount(10); metrics.memberDirectoryMs = Math.round(performance.now() - started);
    started = performance.now(); await page.goto('app://mosque/index.html#/reports?kind=ledger');
    await page.getByLabel(financeText('en', 'from'), { exact: true }).fill(qaFilters.from);
    await page.getByLabel(financeText('en', 'until'), { exact: true }).fill(qaFilters.until);
    await expect(page.locator('tbody tr')).toHaveCount(25); metrics.ledgerRenderMs = Math.round(performance.now() - started);
    const first = await page.locator('tbody tr').first().innerText();
    await page.getByRole('button', { name: financeText('en', 'next'), exact: true }).click();
    await expect(page.locator('tbody tr').first()).not.toHaveText(first);
    await expect(page.getByText(`2 / ${Math.ceil((size * 4 + 2) / 25)}`, { exact: true })).toBeVisible();
    const seed = JSON.parse(await readFile(join(root, String(size), 'fixture.json'), 'utf8')) as { planId: string };
    const response = await page.evaluate(async planId => {
      let frames = 0; const interval = setInterval(() => frames++, 16); const t = performance.now();
      try { const result = await window.mosque!.generateFinanceDues({ key: crypto.randomUUID(), planId, from: '2026-12', until: '2026-12', confirmation: 'CONFIRM DEMO FINANCE' }); return { result, frames, ms: performance.now() - t }; }
      finally { clearInterval(interval); }
    }, seed.planId);
    expect(response.result).toMatchObject({ ok: true, data: { created: size } }); expect(response.frames).toBeGreaterThan(1);
    metrics.duesIpcMs = Math.round(response.ms); metrics.rendererFramesDuringDues = response.frames;
    // Exercise real bilingual PDF output after all twelve months exist, fully offline.
    const pdf = join(evidence, `monthly-${size}.pdf`);
    await app.evaluate(({ dialog }, file) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: file }); }, pdf);
    started = performance.now();
    const output = await page.evaluate(filters => window.mosque!.outputFinanceDocument({ document: 'report', report: { kind: 'monthly', familyId: '', filters }, format: 'pdf', layout: 'a4' }), qaFilters);
    metrics.monthlyPdfMs = Math.round(performance.now() - started); expect(output).toEqual({ ok: true, data: true }); expect((await readFile(pdf)).subarray(0, 4).toString()).toBe('%PDF');
    const queue = await page.evaluate(() => window.mosque!.getIntegrationState());
    expect(queue).toMatchObject({ ok: true, data: { connected: false, jobs: expect.arrayContaining([expect.objectContaining({ status: 'approval', attempts: 0 })]) } });
    metrics.processMemory = await app.evaluate(({ app }) => app.getAppMetrics().map(m => ({ type: m.type, memory: m.memory })));
    const viewports: unknown[] = [];
    for (const viewport of [{ width: 1366, height: 768, zoom: 1 }, { width: 1536, height: 864, zoom: 1.25 }, { width: 1920, height: 1080, zoom: 1.5 }]) {
      await app.evaluate(({ BrowserWindow }, viewport) => { const w = BrowserWindow.getAllWindows()[0]; w.setContentSize(viewport.width, viewport.height); w.webContents.setZoomFactor(viewport.zoom); }, viewport);
      await page.getByLabel('Language', { exact: true }).selectOption('ml');
      await expect(page.locator('html')).toHaveAttribute('lang', 'ml');
      await expect(page.getByRole('heading', { name: financeText('ml', 'reports'), exact: true })).toBeVisible();
      await expect(page.locator('tbody tr')).toHaveCount(25);
      await page.getByRole('heading', { name: financeText('ml', 'reports'), exact: true }).scrollIntoViewIfNeeded();
      await page.evaluate(async () => { window.scrollTo(0, 0); await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // Electron's native capture respects zoom; CDP screenshots can misplace scrolled content at non-unit zoom.
      const capture = await app.evaluate(async ({ BrowserWindow }) => {
        const w = BrowserWindow.getAllWindows()[0];
        return { png: (await w.webContents.capturePage()).toPNG().toString('base64'), bounds: w.getContentBounds(), zoom: w.webContents.getZoomFactor() };
      });
      await writeFile(join(evidence, `ledger-ml-${size}-${viewport.width}-${viewport.zoom}.png`), Buffer.from(capture.png, 'base64'));
      viewports.push({ requested: viewport, actual: capture.bounds, zoom: capture.zoom, renderer: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio })) });
      expect((await new AxeBuilder({ page }).setLegacyMode().withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()).violations).toEqual([]);
      // Restore the selector label before the next scale.
      await page.getByLabel('ഭാഷ', { exact: true }).selectOption('en');
    }
    metrics.viewports = viewports;
    expect(await page.locator('vite-error-overlay').count()).toBe(0); expect(errors).toEqual([]);
    await mkdir('tmp/phase7', { recursive: true });
    const label = process.env.MOSQUE_QA_LABEL ?? 'current'; if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid label');
    await writeFile(resolve(`tmp/phase7/ui-${label}-${size}.json`), JSON.stringify({ ...metrics, evidence, errors }, null, 2));
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(w => w.destroy())).catch(() => {}); await app.close();
    await rm(userData, { recursive: true, force: true });
  }
});
