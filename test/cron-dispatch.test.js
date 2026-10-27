import test from 'node:test';import assert from 'node:assert/strict';
import { dispatchCron } from '../worker/cron.js';
test('cron dispatches due routes to independent invocations and bounds each batch',async()=>{
 const ids=Array.from({length:20},(_,i)=>({id:'r'+i}));let query;const calls=[];
 const env={DB:{prepare(sql){query=sql;return {bind(now,limit){assert.equal(now,1000);assert.equal(limit,20);return {all:async()=>({results:ids})};}};}},SCHEDULER:{async runRoute(id,now){calls.push([id,now]);return {sent:1,errors:0};}}};
 const result=await dispatchCron(env,1000);assert.equal(calls.length,20);assert.equal(result.sent,20);assert.match(query,/next_check/);
});
