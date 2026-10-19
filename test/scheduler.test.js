import test from 'node:test';import assert from 'node:assert/strict';
import { monitoringWindow, runTick } from '../server/scheduler.js';
const route={id:'r1',origin:'집',station:{name:'종로'},bus:{name:'143'},walkMinutes:7,bufferMinutes:1,enabled:true,time:'08:30',days:[1,2,3,4,5]};
const mem=()=>({data:{devices:{d:{routes:[structuredClone(route)],subscription:{endpoint:'test'}}}},read(){return structuredClone(this.data);},async transaction(fn){return fn(this.data);}});
const now=new Date('2026-10-19T23:00:00+09:00');
test('Seoul commute window handles weekdays, future midnight and excludes stale schedules',()=>{
 assert.ok(monitoringWindow(route,new Date('2026-10-19T08:00:00+09:00')));assert.equal(monitoringWindow(route,new Date('2026-10-18T08:00:00+09:00')),null);assert.equal(monitoringWindow(route,new Date('2026-10-19T09:00:00+09:00')),null);
 assert.equal(monitoringWindow({...route,time:'00:15'},new Date('2026-10-19T23:40:00+09:00')),'2026-10-20');
});
const commute=new Date('2026-10-19T08:00:00+09:00');
test('scheduler sends each stage once, retries failures and never sends simulated data',async()=>{
 const store=mem();let sent=0;let seconds=1000;const transit={mode:'live',arrival:async()=>({seconds,mode:'live'})};const push={ready:true,send:async()=>{sent++;}};
 await runTick({store,transit,push,now:commute});await runTick({store,transit,push,now:commute});assert.equal(sent,1);seconds=480;await runTick({store,transit,push,now:commute});await runTick({store,transit,push,now:commute});assert.equal(sent,2);
 await runTick({store:mem(),transit:{...transit,mode:'demo'},push,now:commute});assert.equal(sent,2);
 const retry=mem();let fail=true;const sender={ready:true,send:async()=>{if(fail)throw Error('offline');sent++;}};await runTick({store:retry,transit,push:sender,now:commute});fail=false;await runTick({store:retry,transit,push:sender,now:commute});assert.equal(sent,3);
});
test('expired subscriptions removed; changes during arrival fetch suppress sends',async()=>{
 const store=mem();await runTick({store,transit:{mode:'live',arrival:async()=>({seconds:480,mode:'live'})},push:{ready:true,send:async()=>{throw Object.assign(Error(),{status:410});}},now:commute});assert.equal(store.read().devices.d.subscription,null);
 const changing=mem();let sent=0;await runTick({store:changing,transit:{mode:'live',arrival:async()=>{changing.data.devices.d.routes[0].enabled=false;return {seconds:480,mode:'live'};}},push:{ready:true,send:async()=>sent++},now:commute});assert.equal(sent,0);
});
