import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
mkdirSync(new URL('../.wrangler/',import.meta.url),{recursive:true});
const child=spawn(process.execPath,[fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url)),...process.argv.slice(2)],{cwd:root,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG_PATH:root+'.wrangler/logs',XDG_CONFIG_HOME:process.env.XDG_CONFIG_HOME||root+'.wrangler/config'}});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('Wrangler를 실행하지 못했어요. npm ci를 실행해 주세요.');process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
