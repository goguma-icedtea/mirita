import test from 'node:test';import assert from 'node:assert/strict';
import { commuteWindow, selectArrival, stageDecisions } from '../worker/schedule.js';
const route={time:'08:30',days:[1,2,3,4,5],createdAt:'2026-10-18T00:00:00Z'};
const now=Date.parse('2026-10-19T08:00:00+09:00');
test('Seoul schedules include previous-day monitoring and expire after target grace',()=>{
 assert.equal(commuteWindow(route,now).day,'2026-10-19');
 assert.equal(commuteWindow(route,Date.parse('2026-10-18T08:00:00+09:00')),null);
 assert.equal(commuteWindow(route,Date.parse('2026-10-19T08:46:00+09:00')),null);
 assert.equal(commuteWindow({...route,time:'00:15'},Date.parse('2026-10-19T23:40:00+09:00')).day,'2026-10-20');
});
test('arrival selection tracks closest target vehicle and never silently replaces it',()=>{
 const target=now+30*60000;const candidates=[{vehicleId:'a',arrivalAt:now+300000},{vehicleId:'b',arrivalAt:target-60000}];
 assert.equal(selectArrival(candidates,target).vehicleId,'b');assert.equal(selectArrival(candidates,target,'a').vehicleId,'a');
 assert.equal(selectArrival(candidates,target,'gone'),null);assert.equal(selectArrival([{vehicleId:'',arrivalAt:target}],target),null);
});
test('30/15/5 stages tolerate polling jitter without sending all overdue stages',()=>{
 const input={now,createdAt:Date.parse(route.createdAt),arrivalAt:now+1790*1000,events:[]};
 assert.deepEqual(stageDecisions(input),[{stage:30,status:'send'}]);
 assert.deepEqual(stageDecisions({...input,arrivalAt:now+890000,events:[{stage:30,status:'sent'}]}),[{stage:15,status:'send'}]);
 assert.deepEqual(stageDecisions({...input,arrivalAt:now+290000,events:[{stage:30,status:'sent'},{stage:15,status:'sent'}]}),[{stage:5,status:'send'}]);
 assert.deepEqual(stageDecisions({...input,arrivalAt:now+290000}),[{stage:30,status:'skipped'},{stage:15,status:'skipped'},{stage:5,status:'send'}]);
 assert.deepEqual(stageDecisions({...input,createdAt:now,arrivalAt:now+290000}),[{stage:30,status:'skipped'},{stage:15,status:'skipped'},{stage:5,status:'skipped'}]);
 assert.deepEqual(stageDecisions({...input,events:[{stage:30,status:'uncertain'}]}),[]);
 assert.deepEqual(stageDecisions({...input,events:[{stage:30,status:'sending'}]}),[]);
});
test('yesterday commute remains active after Seoul midnight',()=>{
 const r={...route,time:'23:55',days:[1]};const time=Date.parse('2026-10-20T00:01:00+09:00');assert.equal(commuteWindow(r,time)?.day,'2026-10-19');
});
