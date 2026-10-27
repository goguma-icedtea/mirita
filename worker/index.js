import { WorkerEntrypoint } from 'cloudflare:workers';
import { dispatchCron, cleanup } from './cron.js';
import { AppError, validateRoute } from '../server/domain.js';
import { Transit } from '../server/transit.js';
import { Push, validateSubscription } from '../server/push.js';
import { arrivalView } from './arrival.js';
import { TransitCache } from './cache.js';
import { runCloudTick } from './scheduler.js';
import { Repository, hash } from './repository.js';
const security={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Permissions-Policy':'geolocation=(self)','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"};
export function services(env){return {repo:new Repository(env.DB),transit:new Transit({key:env.SEOUL_BUS_API_KEY||'',cache:new TransitCache(env.DB)}),push:new Push({publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY,subject:env.VAPID_SUBJECT})};}
async function handle(request,env){
 const url=new URL(request.url),path=url.pathname;let cookie='';
 const json=(status,data)=>new Response(JSON.stringify(data),{status,headers:{...security,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(cookie?{'Set-Cookie':cookie}:{})}});
 try{
  if(path==='/healthz'){try{await env.DB.prepare('SELECT eligible_at FROM routes LIMIT 1').first();return json(200,{ok:true,mode:env.SEOUL_BUS_API_KEY?'live':'demo'});}catch{return json(503,{ok:false,error:'데이터베이스 연결과 마이그레이션을 확인해 주세요.'});}}
  if(!path.startsWith('/api/')){
   if(!['GET','HEAD'].includes(request.method))throw new AppError('지원하지 않는 요청이에요.',405);
   const target=path==='/app'?'/app.html':path==='/'?'/index.html':path;
   const asset=await env.ASSETS.fetch(new Request(new URL(target,url),request));const response=new Response(asset.body,asset);for(const [k,v]of Object.entries(security))response.headers.set(k,v);if(target.endsWith('.html')||path==='/'||path==='/sw.js')response.headers.set('Cache-Control','no-cache');return response;
  }
  if(!['GET','HEAD'].includes(request.method)&&(request.headers.get('Origin')!==(env.APP_ORIGIN||url.origin)||!request.headers.get('Content-Type')?.startsWith('application/json')))throw new AppError('이 페이지에서 다시 시도해 주세요.',403);
  const {repo,transit,push}=services(env);
  const supplied=request.headers.get('Cookie')?.match(/(?:^|;\s*)mirita_device=([a-f0-9]{64})(?:;|$)/)?.[1];
  const token=supplied||Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');const device=await hash(token);
  if(!supplied)cookie=`mirita_device=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${url.protocol==='https:'?'; Secure':''}`;
  const ip=request.headers.get('CF-Connecting-IP')||'local';await repo.budget('ip:'+await hash(ip),600);await repo.budget('device:'+device,180);
  const body=async()=>{if(Number(request.headers.get('Content-Length'))>32768)throw new AppError('입력 내용이 너무 길어요.',413);const reader=request.body?.getReader();if(!reader)return {};let size=0;const chunks=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw new AppError('입력 내용이 너무 길어요.',413);}chunks.push(value);}const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}try{return JSON.parse(new TextDecoder().decode(all)||'{}');}catch{throw new AppError('입력 형식을 확인해 주세요.');}};
  const canonical=async input=>{const v=validateRoute(input);const stations=await transit.stations(v.station.name);const station=stations.find(s=>s.id===v.station.id&&s.arsId===v.station.arsId);if(!station)throw new AppError('정류장을 다시 선택해 주세요.');const bus=(await transit.buses(station)).find(b=>b.id===v.bus.id&&b.order===v.bus.order);if(!bus)throw new AppError('선택한 정류장의 버스를 다시 선택해 주세요.');return {...v,station:{id:station.id,arsId:station.arsId,name:station.name},bus};};
  if(path==='/api/config'&&request.method==='GET'){const stored=await repo.subscription(device);const subscription=stored?JSON.parse(stored.data):null;return json(200,{mode:transit.mode,region:'서울',pushReady:push.ready,publicKey:push.ready?push.keys.publicKey:null,subscribed:Boolean(subscription),subscriptionFingerprint:subscription?await hash(JSON.stringify([subscription.endpoint,subscription.keys.auth,subscription.keys.p256dh])):null,notificationStages:[30,15,5]});}
  if(path==='/api/stations'&&request.method==='GET')return json(200,{stations:await transit.stations(url.searchParams.get('q'))});
  if(path==='/api/nearby'&&request.method==='GET')return json(200,{stations:await transit.nearby(Number(url.searchParams.get('lat')),Number(url.searchParams.get('lng')))});
  if(path==='/api/buses'&&request.method==='GET'){const station={id:url.searchParams.get('id'),arsId:url.searchParams.get('arsId')};if(!/^\d{1,12}$/.test(station.id)||!/^\d{1,12}$/.test(station.arsId))throw new AppError('정류장을 선택해 주세요.');return json(200,{buses:await transit.buses(station)});}
  if(path==='/api/routes'&&request.method==='GET')return json(200,{routes:await repo.routes(device)});
  if(path==='/api/routes'&&request.method==='POST'){const v=await canonical(await body());return json(201,await repo.save(device,{...v,id:crypto.randomUUID(),createdAt:new Date().toISOString()}));}
  const match=path.match(/^\/api\/routes\/([a-f0-9-]+)(\/arrival)?$/);
  if(match){const row=await repo.route(device,match[1]);if(!row)throw new AppError('저장된 경로를 찾지 못했어요.',404);const route=row.value;
   if(match[2]&&request.method==='GET'){return json(200,await arrivalView(repo,transit,row));}
   if(!match[2]&&request.method==='PUT'){const input=validateRoute(await body());const unchanged=input.station.id===route.station.id&&input.station.arsId===route.station.arsId&&input.bus.id===route.bus.id&&input.bus.order===route.bus.order;const v=unchanged?{...input,station:route.station,bus:route.bus}:await canonical(input);return json(200,await repo.save(device,{...route,...v},route.id));}
   if(!match[2]&&request.method==='DELETE'){await repo.remove(device,route.id);return json(200,{ok:true});}
  }
  if(path==='/api/push/subscription'&&request.method==='POST'){if(!push.ready)throw new AppError('서버 알림 설정이 필요해요.',503);await repo.subscribe(device,validateSubscription(await body()));return json(200,{ok:true});}
  if(path==='/api/push/subscription'&&request.method==='DELETE'){await repo.unsubscribe(device);return json(200,{ok:true});}
  if(path==='/api/push/test'&&request.method==='POST'){if(!push.ready)throw new AppError('서버 알림 설정이 필요해요.',503);const sub=await repo.subscription(device);if(!sub)throw new AppError('먼저 알림을 켜 주세요.');try{await push.send(JSON.parse(sub.data),{title:'미리타 알림이 연결됐어요',body:'실제 기기 알림함에서 수신을 확인해 주세요.',tag:'mirita-test',url:'/app'});}catch(e){if([404,410].includes(e.status))await repo.unsubscribe(device,sub.revision);throw new AppError('알림을 보내지 못했어요. 알림 연결을 다시 확인해 주세요.',502);}return json(200,{ok:true});}
  if(path==='/api/device'&&request.method==='DELETE'){await repo.deleteDevice(device);cookie=`mirita_device=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${url.protocol==='https:'?'; Secure':''}`;return json(200,{ok:true});}
  throw new AppError('요청을 찾지 못했어요.',404);
 }catch(e){return json(e instanceof AppError?e.status:500,{error:e instanceof AppError?e.message:'요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.'});}
}
export class Scheduler extends WorkerEntrypoint {
 async runRoute(routeId,now){return runCloudTick({...services(this.env),routeId,now:Date.now(),clock:Date.now,batchSize:1});}
}
export default {fetch:handle,async scheduled(controller,env){
 const stats=await dispatchCron(env,Date.now());
 if(new Date(controller.scheduledTime).getUTCMinutes()===0)await cleanup(env.DB,controller.scheduledTime);
 console.log(JSON.stringify({event:'scheduler',...stats}));
}};
