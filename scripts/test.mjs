// Exercise the storage tests with the same embedded Node runtime as the desktop.
// SQLite 13's supplied Node-API binary is also verified with host Node at install.
import { spawn } from 'node:child_process';
import electron from 'electron';
const child = spawn(electron, ['node_modules/vitest/vitest.mjs', 'run', ...process.argv.slice(2)], {
  stdio: 'inherit', windowsHide: true,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});
child.on('exit', code => process.exit(code ?? 1));
child.on('error', error => { console.error(error.message); process.exit(1); });
