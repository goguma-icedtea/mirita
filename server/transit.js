import { AppError } from './domain.js';
const samples=[{id:'100000001',arsId:'01001',name:'종로2가',lat:37.5701,lng:126.987},{id:'100000002',arsId:'01002',name:'종로1가',lat:37.5702,lng:126.983},{id:'100000003',arsId:'01003',name:'광화문',lat:37.571,lng:126.977}];
const demoBuses=[{id:'100100001',name:'143',order:'3',direction:'정릉 방면'},{id:'100100002',name:'273',order:'5',direction:'중랑 방면'},{id:'100100003',name:'721',order:'7',direction:'북가좌동 방면'}];
export class Transit {
 constructor({key='',fetcher=fetch,clock=Date.now,cache=new Map()}={}){this.key=key;this.fetcher=fetcher;this.clock=clock;this.mode=key?'live':'demo';this.cache=cache;}
 async snapshot(path,params,ttl=15000){
 const cacheKey=path+JSON.stringify(params);const cached=await this.cache.get(cacheKey);if(cached&&cached.exp>this.clock())return structuredClone(cached);
 try{const url=new URL('https://ws.bus.go.kr/api/rest/'+path);url.search=new URLSearchParams({...params,serviceKey:this.key,resultType:'json'});const r=await this.fetcher(url,{signal:AbortSignal.timeout(8000),redirect:'error'});if(!r.ok)throw Error();const data=await r.json();const code=String(data.msgHeader?.headerCd);if(!['0','4'].includes(code))throw Error();const rows=data.msgBody?.itemList;const observedAt=this.clock();const value={items:code==='4'?[]:Array.isArray(rows)?rows:rows?[rows]:[],observedAt,exp:observedAt+ttl};if(this.cache.size>500)this.cache.clear();await this.cache.set(cacheKey,value);return structuredClone(value);}catch{throw new AppError('버스 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.',502);}
 }
 async request(path,params,ttl=15000){return (await this.snapshot(path,params,ttl)).items;}

 station(x){return {id:String(x.stId??x.stationId??''),arsId:String(x.arsId??''),name:String(x.stNm??x.stationNm??''),lat:Number(x.tmY??x.gpsY),lng:Number(x.tmX??x.gpsX)};}
 async stations(q){if(typeof q!=='string'||q.trim().length<2||q.length>80)throw new AppError('정류장 이름을 두 글자 이상 입력해 주세요.');if(this.mode==='demo')return samples.filter(s=>s.name.includes(q.trim())||s.arsId.includes(q.trim()));return (await this.request('stationinfo/getStationByName',{stSrch:q.trim()},60000)).map(x=>this.station(x)).filter(x=>x.arsId!=='0'&&x.arsId!=='');}
 async nearby(lat,lng){if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<33||lat>39||lng<124||lng>132)throw new AppError('위치 정보를 확인해 주세요.');if(this.mode==='demo')return samples;return (await this.request('stationinfo/getStationByPos',{tmX:String(lng),tmY:String(lat),radius:'500'},60000)).map(x=>this.station(x)).filter(x=>x.arsId!=='0'&&x.arsId!=='');}
 async buses(station){if(this.mode==='demo')return samples.some(s=>s.id===station.id&&s.arsId===station.arsId)?demoBuses:[];return (await this.request('stationinfo/getRouteByStation',{arsId:station.arsId},60000)).map(x=>({id:String(x.busRouteId),name:String(x.busRouteNm),order:String(x.staOrd),direction:String(x.direction??'')}));}
 async arrival(route){
  let now=this.clock();
  if(this.mode==='demo')return {seconds:480,message:'체험용 도착 정보',mode:'demo',updatedAt:new Date(now).toISOString(),candidates:[{vehicleId:'demo',seconds:480,arrivalAt:now+480000}]};
  const snapshot=await this.snapshot('arrive/getArrInfoByRoute',{stId:route.station.id,busRouteId:route.bus.id,ord:route.bus.order});const [x]=snapshot.items;now=this.clock();
  const candidates=[1,2].flatMap(i=>{const seconds=Number(x?.['traTime'+i]);const message=String(x?.['arrmsg'+i]||'');if(!Number.isFinite(seconds)||seconds<=0||/운행종료|출발대기|정보없음|회차대기/.test(message))return [];const arrivalAt=snapshot.observedAt+seconds*1000;return arrivalAt>now?[{vehicleId:String(x?.['vehId'+i]||'').replace(/^0$/,''),seconds:Math.ceil((arrivalAt-now)/1000),arrivalAt,message}]:[];});
  return {seconds:candidates[0]?.seconds??null,candidates,message:String(x?.arrmsg1??'도착 정보가 없어요.'),mode:'live',updatedAt:new Date(snapshot.observedAt).toISOString()};
 }
}
