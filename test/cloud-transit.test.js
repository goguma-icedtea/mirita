import test from 'node:test';import assert from 'node:assert/strict';import { Transit } from '../server/transit.js';
const route={station:{id:'1'},bus:{id:'2',order:'3'}};
test('real adapter returns both vehicle identities and original cache observation time',async()=>{
 let calls=0;let now=1000000;
 const transit=new Transit({key:'private',clock:()=>now,fetcher:async()=>{calls++;return new Response(JSON.stringify({msgHeader:{headerCd:'0'},msgBody:{itemList:[{traTime1:'600',traTime2:'1800',vehId1:'12345',vehId2:'67890',arrmsg1:'10분후',arrmsg2:'30분후'}]}}));}});
 const first=await transit.arrival(route);assert.equal(first.candidates.length,2);assert.equal(first.candidates[1].vehicleId,'67890');assert.equal(first.candidates[1].arrivalAt,2800000);
 now+=10000;const cached=await transit.arrival(route);assert.equal(cached.seconds,590);assert.equal(cached.updatedAt,first.updatedAt);assert.equal(calls,1);
});
test('provider latency never inflates remaining arrival seconds',async()=>{
 let now=1000000;const transit=new Transit({key:'fixture',clock:()=>now,fetcher:async()=>{now+=10000;return new Response(JSON.stringify({msgHeader:{headerCd:'0'},msgBody:{itemList:[{traTime1:'600',vehId1:'123',arrmsg1:'10분후'}]}}));}});assert.equal((await transit.arrival(route)).seconds,600);
});
