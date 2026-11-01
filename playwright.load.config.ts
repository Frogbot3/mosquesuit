import { defineConfig } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({ testDir: './tests/load', timeout: 180000, workers: 1, reporter: 'list', outputDir: join(tmpdir(), 'mosque-suite-load-playwright'), expect: { timeout: 15000 }, use: { trace: 'retain-on-failure' } });
