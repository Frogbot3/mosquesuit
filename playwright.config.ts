import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'list',
  outputDir: join(tmpdir(), 'mosque-suite-playwright'),
  use: { trace: 'retain-on-failure' },
});
