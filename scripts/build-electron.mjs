import { build } from 'esbuild';

await build({
  entryPoints: { main: 'electron/main.ts', preload: 'electron/preload.ts' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  external: ['electron', 'better-sqlite3','exceljs','@node-rs/argon2'],
  sourcemap: false,
});
