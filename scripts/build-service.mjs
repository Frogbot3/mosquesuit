import { build } from 'esbuild';
await build({entryPoints:{main:'service/main.ts'},bundle:true,platform:'node',format:'cjs',target:'node24',outdir:'dist-service',outExtension:{'.js':'.cjs'},external:['better-sqlite3'],sourcemap:false});
