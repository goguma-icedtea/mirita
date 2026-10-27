import { readdirSync } from 'node:fs';import { spawnSync } from 'node:child_process';
for(const dir of ['worker','server','scripts','public'])for(const file of readdirSync(dir)){if(!/\.(js|mjs)$/.test(file))continue;const result=spawnSync(process.execPath,['--check',dir+'/'+file],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}
console.log('PASS JavaScript syntax: worker, server, scripts, public');
