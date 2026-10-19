import test from 'node:test';import assert from 'node:assert/strict';import { mkdtemp, mkdir, rm } from 'node:fs/promises';import { join } from 'node:path';
import { Store } from '../server/store.js';import { Transit } from '../server/transit.js';import { createApp } from '../server/app.js';
const draft={origin:'집',station:{id:'100000001',arsId:'01001',name:'종로2가'},bus:{id:'100100001',name:'143',order:'3'},walkMinutes:7,bufferMinutes:1,time:'08:30',days:[1,2,3,4,5],enabled:true};
async function setup(t){await mkdir('test-results',{recursive:true});const dir=await mkdtemp(join(process.cwd(),'test-results','api-'));const store=await Store.open(join(dir,'db.json'));const server=createApp({store,transit:new Transit(),push:{ready:false,keys:{publicKey:''}}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;t.after(async()=>{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});});let cookie='';return {base,store,async req(path,method='GET',body,custom={}){const r=await fetch(base+path,{method,headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json',...custom},body:body===undefined?undefined:JSON.stringify(body)});if(r.headers.has('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];return r;}};}
test('HTTP create/read/update/delete persists and isolates anonymous devices',async t=>{
 const a=await setup(t);let r=await a.req('/api/routes','POST',draft);assert.equal(r.status,201);const saved=await r.json();assert.ok(saved.id);
 assert.equal((await(await a.req('/api/routes')).json()).routes.length,1);assert.equal((await(await a.req(`/api/routes/${saved.id}/arrival`)).json()).advice.state,'leave');
 const outsider=await fetch(a.base+`/api/routes/${saved.id}`,{method:'DELETE',headers:{Origin:a.base,'Content-Type':'application/json'}});assert.equal(outsider.status,404);
 assert.equal((await a.req(`/api/routes/${saved.id}`,'PUT',{...draft,origin:'우리 집'})).status,200);assert.equal(a.store.read().devices[Object.keys(a.store.read().devices)[0]].routes[0].origin,'우리 집');
 assert.equal((await a.req(`/api/routes/${saved.id}`,'DELETE')).status,200);assert.equal((await(await a.req('/api/routes')).json()).routes.length,0);
});
test('HTTP rejects cross-origin writes, invalid body and fabricated bus selection',async t=>{
 const a=await setup(t);assert.equal((await a.req('/api/routes','POST',draft,{Origin:'https://evil.test'})).status,403);assert.equal((await a.req('/api/routes','POST',{...draft,walkMinutes:0})).status,400);assert.equal((await a.req('/api/routes','POST',{...draft,bus:{...draft.bus,id:'9999'}})).status,400);
 assert.equal((await a.req('/api/push/test','POST',{})).status,503);assert.equal((await a.req('/api/stations?q=없는정류장')).status,200);assert.equal((await a.req('/server/index.js')).status,404);
});
