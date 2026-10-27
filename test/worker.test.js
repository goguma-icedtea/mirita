import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

async function worker(t,bindings={},migrate=true){
 await build({entryPoints:['worker/index.js'],outfile:'.superpowers/worker-test.mjs',bundle:true,format:'esm',platform:'neutral',external:['node:*','cloudflare:*']});
 const mf=new Miniflare(convertV4MiniflareOptions({name:'mirita-test',serviceBindings:{SCHEDULER:{name:'mirita-test',entrypoint:'Scheduler'}},modules:true,scriptPath:'.superpowers/worker-test.mjs',compatibilityDate:'2026-10-27',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{APP_ORIGIN:'http://localhost:3000',...bindings},outboundService:async()=>new Response('provider unavailable',{status:503}),assets:{directory:'public',binding:'ASSETS',routerConfig:{invoke_user_worker_ahead_of_assets:true,has_user_worker:true},assetConfig:{html_handling:'none'}}}));
 t.after(()=>mf.dispose());
 const db=await mf.getD1Database('DB');if(migrate)for(const file of ['0001_initial.sql','0002_eligibility.sql'])await db.exec((await readFile('migrations/'+file,'utf8')).replaceAll('\n',' '));
 return {mf,db};
}
// Exercise the actual workerd Fetch handler and D1, rather than a SQL mock.
test('Worker API persists isolated routes, enforces CSRF and atomically limits routes',async t=>{
 const {mf,db}=await worker(t);
 let cookie='';
 const req=async(path,method='GET',body,headers={})=>{const r=await mf.dispatchFetch('http://localhost:3000'+path,{method,headers:{Origin:'http://localhost:3000','Content-Type':'application/json',Cookie:cookie,...headers},body:body===undefined?undefined:JSON.stringify(body)});if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;};
 const health=await req('/healthz');assert.equal(health.status,200,await health.clone().text());assert.deepEqual(await health.json(),{ok:true,mode:'demo'});
 const draft={origin:'집',station:{id:'100000001',arsId:'01001',name:'종로2가'},bus:{id:'100100001',name:'143',order:'3'},walkMinutes:7,bufferMinutes:1,time:'08:30',days:[1,2,3,4,5],enabled:true};
 assert.equal((await req('/api/routes','POST',draft,{Origin:'https://evil.example'})).status,403);
 const created=await req('/api/routes','POST',draft);assert.equal(created.status,201);const route=await created.json();
 assert.ok(cookie.includes('mirita_device='));
 assert.equal((await(await req('/api/routes')).json()).routes.length,1);
 await db.prepare('INSERT INTO subscriptions(device_id,data,revision) VALUES (?,?,?)').bind((await db.prepare('SELECT id FROM devices').first()).id,JSON.stringify({endpoint:'test',keys:{auth:'a',p256dh:'b'}}),'test').run();
 const cron=await(await mf.getWorker()).scheduled({scheduledTime:Date.now()});assert.equal(cron.outcome,'ok');
 const outsider=await mf.dispatchFetch('http://localhost:3000/api/routes/'+route.id,{method:'DELETE',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'}});assert.equal(outsider.status,404);
 const savedCookie=cookie;
 const parallel=await Promise.all(Array.from({length:12},()=>req('/api/routes','POST',draft)));
 assert.equal(parallel.filter(r=>r.status===201).length,9);
 assert.equal((await(await req('/api/routes')).json()).routes.length,10);
 assert.equal((await req('/api/routes/'+route.id,'PUT',{...draft,origin:'새 집'})).status,200);
 assert.equal((await(await req('/api/routes')).json()).routes.find(r=>r.id===route.id).origin,'새 집');
 const arrival=await(await req('/api/routes/'+route.id+'/arrival')).json();assert.equal(arrival.mode,'demo');assert.equal(arrival.advice.leaveInMinutes,0);
 assert.equal((await req('/api/routes/'+route.id,'DELETE')).status,200);
 assert.equal((await req('/api/device','DELETE',{})).status,200);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM routes').first()).n,0);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM devices').first()).n,0);
 cookie=savedCookie;assert.equal((await(await req('/api/routes')).json()).routes.length,0);
 assert.equal((await req('/server/index.js')).status,404);
 const landing=await req('/');assert.equal(landing.status,200);assert.match(await landing.text(),/data-block/);
 const app=await req('/app');assert.equal(app.status,200);assert.match(await app.text(),/미리타/);assert.ok(app.headers.get('content-security-policy'));
});

test('route notification can be disabled while live transit provider is unavailable',async t=>{
 const {Repository,hash}=await import('../worker/repository.js');const {mf,db}=await worker(t,{SEOUL_BUS_API_KEY:'fixture-only-key'});const repo=new Repository(db);const token='a'.repeat(64);const device=await hash(token);
 const route={id:'abcdef',origin:'집',station:{id:'100000001',arsId:'01001',name:'종로2가'},bus:{id:'100100001',name:'143',order:'3'},walkMinutes:7,bufferMinutes:1,time:'08:30',days:[1,2,3,4,5],enabled:true,createdAt:new Date().toISOString()};await repo.save(device,route);
 const response=await mf.dispatchFetch('http://localhost:3000/api/routes/abcdef',{method:'PUT',headers:{Origin:'http://localhost:3000','Content-Type':'application/json',Cookie:'mirita_device='+token},body:JSON.stringify({...route,enabled:false})});assert.equal(response.status,200,await response.clone().text());assert.equal((await repo.route(device,route.id)).value.enabled,false);
});

test('health check rejects an uninitialized D1 binding',async t=>{const {mf}=await worker(t,{},false);assert.equal((await mf.dispatchFetch('http://localhost:3000/healthz')).status,503);});
