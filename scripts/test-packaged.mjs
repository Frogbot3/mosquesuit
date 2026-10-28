import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', 'packaged.spec.ts'], {
  stdio: 'inherit', windowsHide: true,
  env: { ...process.env, MOSQUE_PACKAGED_EXE: resolve('release/windows-preview/win-unpacked/Mosque Suite.exe') },
});
child.on('exit', code => process.exit(code ?? 1));
child.on('error', error => { console.error(error.message); process.exit(1); });
