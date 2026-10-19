import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validateRoute, departure } from '../server/domain.js';
import { Store } from '../server/store.js';
import { Transit } from '../server/transit.js';
export const draft={origin:'집',station:{id:'100000001',arsId:'01001',name:'종로2가'},bus:{id:'100100001',name:'143',order:'3'},walkMinutes:7,bufferMinutes:1,time:'08:30',days:[1,2,3,4,5],enabled:true};
test('route validation trims input and rejects invalid values',()=>{
 assert.equal(validateRoute({...draft,origin:' 집 '}).origin,'집');
 for(const patch of [{origin:''},{walkMinutes:0},{walkMinutes:61},{walkMinutes:'7'},{bufferMinutes:0},{time:'24:00'},{days:[]},{days:[7]},{station:{id:'x'}},{bus:{id:'1',name:'x',order:'NaN'}},{enabled:'yes'}]) assert.throws(()=>validateRoute({...draft,...patch}));
});
test('departure includes walking and safety margin and never invents missing arrivals',()=>{
 assert.deepEqual(departure(600,7,1),{minutes:10,leaveInMinutes:2,state:'wait'});
 assert.equal(departure(480,7,1).state,'leave');
 assert.equal(departure(120,7,1).state,'missed');
 assert.equal(departure(null,7,1),null);
});
test('store serializes concurrent mutations and survives restart',async()=>{
 await mkdir('test-results',{recursive:true});const dir=await mkdtemp(join(process.cwd(),'test-results','mirita-'));const path=join(dir,'db.json');
 try{ const s=await Store.open(path);await Promise.all(Array.from({length:20},()=>s.transaction(d=>{d.count=(d.count||0)+1;})));assert.equal(s.read().count,20);assert.equal((await Store.open(path)).read().count,20);
 await assert.rejects(s.transaction(d=>{d.count=0;throw Error('abort');}));assert.equal(s.read().count,20);assert.equal(JSON.parse(await readFile(path)).count,20);
 }finally{await rm(dir,{recursive:true,force:true});}
});
const response=items=>new Response(JSON.stringify({msgHeader:{headerCd:'0'},msgBody:{itemList:items}}));
test('Seoul adapter normalizes stations, buses and arrival seconds without leaking key',async()=>{
 const urls=[];const t=new Transit({key:'a+b=',fetcher:async url=>{urls.push(new URL(url)); if(url.pathname.includes('getStationByName'))return response([{stId:'100000001',arsId:'01001',stNm:'종로2가'}]); if(url.pathname.includes('getRouteByStation'))return response([{busRouteId:'100100001',busRouteNm:'143',staOrd:'3',direction:'정릉'}]);return response([{traTime1:'600',arrmsg1:'10분후[5번째 전]',vehId1:'123'}]);}});
 const [s]=await t.stations('종로');assert.equal(s.name,'종로2가');assert.equal((await t.buses(s))[0].order,'3');assert.equal((await t.arrival(draft)).seconds,600);assert.equal(urls[0].searchParams.get('serviceKey'),'a+b=');
});
test('live errors do not silently become demo data; unavailable and empty arrivals are null',async()=>{
 const t=new Transit({key:'secret',fetcher:async()=>new Response(JSON.stringify({msgHeader:{headerCd:'7'}}))});await assert.rejects(t.stations('종로'));
 for(const rows of [[],[{traTime1:'0',arrmsg1:'운행종료'}],[{traTime1:'600',arrmsg1:'운행종료'}],[{traTime1:'abc'}]]) {const x=new Transit({key:'x',fetcher:async()=>response(rows)});assert.equal((await x.arrival(draft)).seconds,null);}
});
test('demo search has genuine empty state and nearby enforces coordinates',async()=>{
 const t=new Transit();assert.ok((await t.stations('종로')).length);assert.equal((await t.stations('없는정류장')).length,0);await assert.rejects(t.nearby(999,127));assert.equal((await t.arrival(draft)).mode,'demo');
});
