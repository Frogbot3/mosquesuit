import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
if(!existsSync('dist-service/main.cjs')){console.error('Build first: npm run build:service');process.exit(1);}
const child=spawn(process.execPath,['dist-service/main.cjs'],{stdio:'inherit',windowsHide:true,env:process.env});
child.on('exit',code=>process.exit(code??1));child.on('error',()=>{console.error('Unable to start integration service.');process.exit(1);});
