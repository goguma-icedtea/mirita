import test from 'node:test';import assert from 'node:assert/strict';import { readFile } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { Repository } from '../worker/repository.js';import { runCloudTick } from '../worker/scheduler.js';
const now=Date.parse('2026-11-02T08:00:00+09:00');
async function setup(t){const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default {fetch(){return new Response("ok")}}',d1Databases:['DB']}));t.after(()=>mf.dispose());const db=await mf.getD1Database('DB');for(const file of ['0001_initial.sql','0002_eligibility.sql'])await db.exec((await readFile('migrations/'+file,'utf8')).replaceAll('\n',' '));const repo=new Repository(db);const route={id:'r1',origin:'집',station:{id:'1',arsId:'01001',name:'종로'},bus:{id:'2',name:'143',order:'3'},walkMinutes:7,bufferMinutes:1,time:'08:30',days:[1,2,3,4,5],enabled:true,createdAt:'2026-10-01T00:00:00Z'};await repo.save('device',route);await repo.subscribe('device',{endpoint:'test'});return {repo,db,route};}
const live=(seconds=1790,vehicleId='bus-1')=>({mode:'live',arrival:async()=>({mode:'live',updatedAt:new Date(now).toISOString(),candidates:[{vehicleId,seconds,arrivalAt:now+seconds*1000}]})});
const due=async db=>db.prepare('UPDATE routes SET next_check=0').run();
test('concurrent cron claims a stage once, preserves 3-stage history through route edits',async t=>{
 const {repo,db,route}=await setup(t);let sent=0;const push={ready:true,send:async()=>{sent++;}};const args={repo,transit:live(),push,now};
 await Promise.all([runCloudTick(args),runCloudTick(args)]);assert.equal(sent,1);assert.equal((await db.prepare('SELECT status FROM notification_events WHERE stage=30').first()).status,'sent');
 await repo.save('device',{...route,origin:'새 집'},route.id);await runCloudTick(args);assert.equal(sent,1);
 for(const [elapsed,seconds]of [[15,890],[25,290]]){await due(db);await runCloudTick({...args,now:now+elapsed*60000,transit:{mode:'live',arrival:async()=>({mode:'live',updatedAt:new Date(now+elapsed*60000).toISOString(),candidates:[{vehicleId:'bus-1',seconds,arrivalAt:now+elapsed*60000+seconds*1000}]})}});}
 assert.equal(sent,3);assert.equal((await db.prepare("SELECT count(*) AS n FROM notification_events WHERE status='sent'").first()).n,3);
 await repo.deleteDevice('device');assert.equal((await db.prepare('SELECT count(*) AS n FROM notification_events').first()).n,0);
});
test('timeout becomes uncertain and never automatically resends; explicit rejection can retry',async t=>{
 const {repo,db}=await setup(t);let sent=0;await runCloudTick({repo,transit:live(),push:{ready:true,send:async()=>{sent++;throw Error('timeout');}},now});
 assert.equal((await db.prepare('SELECT status FROM notification_events').first()).status,'uncertain');await due(db);await runCloudTick({repo,transit:live(),push:{ready:true,send:async()=>{sent++;}},now});assert.equal(sent,1);
 await db.prepare('DELETE FROM notification_events').run();await due(db);await runCloudTick({repo,transit:live(),push:{ready:true,send:async()=>{throw Object.assign(Error('rejected'),{status:503});}},now});assert.equal((await db.prepare('SELECT status FROM notification_events').first()).status,'retry');
 await due(db);await runCloudTick({repo,transit:live(),push:{ready:true,send:async()=>{sent++;}},now});assert.equal(sent,2);
});
test('deleted/disabled routes, stale information, replaced vehicle and demo never send',async t=>{
 const {repo,db,route}=await setup(t);let sent=0;const push={ready:true,send:async()=>sent++};
 await runCloudTick({repo,transit:{mode:'demo'},push,now});assert.equal(sent,0);
 await runCloudTick({repo,transit:{mode:'live',arrival:async()=>({...await live().arrival(),updatedAt:new Date(now-100000).toISOString()})},push,now});assert.equal(sent,0);
 await due(db);await runCloudTick({repo,transit:{mode:'live',arrival:async()=>{await repo.save('device',{...route,enabled:false},route.id);return live().arrival();}},push,now});assert.equal(sent,0);
 await repo.save('device',route,route.id);await runCloudTick({repo,transit:live(),push,now});assert.equal(sent,1);
 await due(db);await runCloudTick({repo,transit:live(890,'replacement'),push,now});assert.equal(sent,1);
});
test('old expired push cannot delete a new subscription',async t=>{
 const {repo}=await setup(t);await runCloudTick({repo,transit:live(),push:{ready:true,send:async()=>{await repo.subscribe('device',{endpoint:'replacement'});throw Object.assign(Error(),{status:410});}},now});assert.equal(JSON.parse((await repo.subscription('device')).data).endpoint,'replacement');
});
test('delayed execution uses current clock rather than rejecting fresh API data',async t=>{
 const {repo}=await setup(t);let sent=0;await runCloudTick({repo,now,clock:()=>now+6000,transit:{mode:'live',arrival:async()=>({...await live().arrival(),updatedAt:new Date(now+6000).toISOString()})},push:{ready:true,send:async()=>sent++}});assert.equal(sent,1);
});
test('stale route revision cannot bind an obsolete vehicle',async t=>{
 const {repo,db,route}=await setup(t);await db.prepare('INSERT INTO commutes(route_id,day) VALUES (?,?)').bind(route.id,'2026-11-02').run();
 await runCloudTick({repo,now,transit:{mode:'live',arrival:async()=>{await repo.save('device',{...route,bus:{...route.bus,id:'other'}},route.id);return live().arrival();}},push:{ready:true,send:async()=>assert.fail('obsolete revision must not send')}});
 assert.equal((await db.prepare('SELECT vehicle_id FROM commutes').first()).vehicle_id,null);
});
test('late reactivation and late subscription do not send elapsed thresholds',async t=>{
 const {repo,db,route}=await setup(t);repo.clock=()=>now;await repo.save('device',{...route,enabled:false},route.id);await repo.save('device',route,route.id);
 let sent=0;await runCloudTick({repo,now,transit:live(),push:{ready:true,send:async()=>sent++}});assert.equal(sent,0);assert.equal((await db.prepare('SELECT status FROM notification_events WHERE stage=30').first()).status,'skipped');
 await db.prepare('DELETE FROM notification_events').run();await repo.unsubscribe('device');await repo.subscribe('device',{endpoint:'new'});await due(db);await runCloudTick({repo,now,transit:live(),push:{ready:true,send:async()=>sent++}});assert.equal(sent,0);
});
