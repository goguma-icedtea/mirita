import { spawn } from 'node:child_process';
import { readFile,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const config='.wrangler.deploy.json';
function run(args,capture=false){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[root+'scripts/wrangler.mjs',...args],{cwd:root,env:process.env,stdio:['inherit',capture?'pipe':'inherit','inherit']});let output='';if(capture)child.stdout.on('data',chunk=>{output+=chunk;});child.on('error',reject);child.on('exit',code=>code===0?resolve(output):reject(Error(`Wrangler 명령 실패 (${code}). 인증·권한·네트워크 설정을 확인해 주세요.`)));});}
async function databaseList(){const out=await run(['d1','list','--json','--config',config],true);try{return JSON.parse(out);}catch{throw Error('D1 목록 JSON을 읽지 못했어요. 기존 자원은 변경하지 않았어요.');}}
try{
 const source=JSON.parse(await readFile(root+'wrangler.jsonc','utf8'));
 let previous=null;try{previous=JSON.parse(await readFile(root+config,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const account=process.env.CLOUDFLARE_ACCOUNT_ID||previous?.account_id;
 if(account&&!/^[a-f0-9]{32}$/i.test(account))throw Error('CLOUDFLARE_ACCOUNT_ID는 Cloudflare 계정의 32자리 ID여야 해요.');
 // Wrangler OAuth can select an account interactively on a developer's machine.
 // Cloud runs should inject the explicit account ID and API token securely.
 const draft={...source,...(account?{account_id:account}:{}),d1_databases:source.d1_databases.map(x=>({...x,database_id:previous?.d1_databases?.find(d=>d.binding===x.binding)?.database_id||x.database_id}))};
 await writeFile(root+config,JSON.stringify(draft,null,2)+'\n',{mode:0o600});
 let databases;try{databases=await databaseList();}catch{throw Error('Cloudflare에 연결하지 못했어요. 환경 설정의 CLOUDFLARE_ACCOUNT_ID·CLOUDFLARE_API_TOKEN을 저장하거나, 내 컴퓨터에서 npm run cf:login을 실행해 주세요.');}
 const name=source.d1_databases[0].database_name;
 let database=databases.find(x=>x.name===name);
 if(!database){await run(['d1','create',name,'--location','apac','--update-config=false','--config',config]);databases=await databaseList();database=databases.find(x=>x.name===name);}
 if(!database?.uuid)throw Error('D1 데이터베이스 ID를 확인하지 못했어요. 기존 DB를 삭제하거나 다시 만들지 마세요.');
 draft.d1_databases[0].database_id=database.uuid;await writeFile(root+config,JSON.stringify(draft,null,2)+'\n',{mode:0o600});
 console.log('Cloudflare D1 연결 설정을 .wrangler.deploy.json에 저장했어요. 비밀값은 포함하지 않아요.');
 if(process.argv.includes('--deploy')){
  await run(['d1','migrations','apply','DB','--remote','--config',config]);
  await run(['deploy','--dry-run','--outdir','.wrangler/dist','--config',config]);
  await run(['deploy','--config',config]);
  console.log('위 HTTPS 배포 주소에서 /healthz, /app과 경로 저장을 확인해 주세요. 키를 등록하지 않았다면 체험 모드예요.');
 }else console.log('배포하려면 npm run cf:deploy를 실행해 주세요. 이 명령은 DB 마이그레이션과 Workers 배포를 수행해요.');
}catch(error){console.error(error.message);process.exitCode=1;}
