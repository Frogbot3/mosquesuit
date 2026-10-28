import { spawn } from 'node:child_process';
import electron from 'electron';
const env = { ...process.env };
if (process.argv.includes('--life-events-demo')) env.MOSQUE_LIFE_EVENTS_DEMO = '1';
if (process.argv.includes('--finance-demo')) env.MOSQUE_FINANCE_DEMO = '1';
delete env.ELECTRON_RUN_AS_NODE;
// This child is the interactive desktop application, not a console helper.
const child = spawn(electron, ['.'], { stdio: 'inherit', env, windowsHide: false });
child.on('exit', code => process.exit(code ?? 1));
child.on('error', error => { console.error(error.message); process.exit(1); });
