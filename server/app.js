import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { AppError, validateRoute, departure } from './domain.js';
import { validateSubscription } from './push.js';
const publicRoot=fileURLToPath(new URL('../public/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
export function createApp({store,transit,push,origin=''}){
 const limits=new Map();
 const server=createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Permissions-Policy','geolocation=(self)');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 try{
 const url=new URL(req.url,'http://localhost');const path=url.pathname;
 if(path==='/healthz')return json(200,{ok:true,mode:transit.mode});
 if(!path.startsWith('/api/')){
 if(req.method!=='GET'&&req.method!=='HEAD')throw new AppError('지원하지 않는 요청이에요.',405);
 const name=path==='/'?'index.html':path==='/app'?'app.html':decodeURIComponent(path.slice(1));const file=resolve(publicRoot,name);if(!file.startsWith(resolve(publicRoot)+sep)||!mime[extname(file)]||name.split('/').some(x=>x.startsWith('.')))throw new AppError('페이지를 찾지 못했어요.',404);
 let data;try{data=await readFile(file);}catch{throw new AppError('페이지를 찾지 못했어요.',404);}res.writeHead(200,{'Content-Type':mime[extname(file)],'Cache-Control':file.endsWith('.html')||file.endsWith('sw.js')?'no-cache':'public, max-age=3600'});return res.end(req.method==='HEAD'?undefined:data);
 }
 const expected=origin||`http://${req.headers.host}`;
 if(!['GET','HEAD'].includes(req.method)&&(req.headers.origin!==expected||!String(req.headers['content-type']||'').startsWith('application/json')))throw new AppError('이 페이지에서 다시 시도해 주세요.',403);
 const supplied=req.headers.cookie?.match(/(?:^|;\s*)mirita_device=([a-f0-9]{64})(?:;|$)/)?.[1];const deviceId=supplied&&store.read().devices[supplied]?supplied:randomBytes(32).toString('hex');
 if(deviceId!==supplied)res.setHeader('Set-Cookie',`mirita_device=${deviceId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${expected.startsWith('https:')?'; Secure':''}`);
 const limitKey=supplied||req.socket.remoteAddress;const now=Date.now();if(limits.size>5000)for(const [key,v]of limits)if(v.until<now)limits.delete(key);const bucket=limits.get(limitKey);if(bucket&&bucket.until>now){if(++bucket.count>180)throw new AppError('잠시 후 다시 시도해 주세요.',429);}else limits.set(limitKey,{until:now+60000,count:1});
 const device=()=>store.read().devices[deviceId]||{routes:[],subscription:null};
 const ensure=d=>d.devices[deviceId]??={routes:[],subscription:null};
 const body=async()=>{let n=0;const chunks=[];for await(const chunk of req){n+=chunk.length;if(n>32768)throw new AppError('입력 내용이 너무 길어요.',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw new AppError('입력 형식을 확인해 주세요.');}};
 const canonical=async input=>{const v=validateRoute(input);const stations=await transit.stations(v.station.name);const station=stations.find(s=>s.id===v.station.id&&s.arsId===v.station.arsId);if(!station)throw new AppError('정류장을 다시 선택해 주세요.');const buses=await transit.buses(station);const bus=buses.find(b=>b.id===v.bus.id&&b.order===v.bus.order);if(!bus)throw new AppError('선택한 정류장의 버스를 다시 선택해 주세요.');return {...v,station:{id:station.id,arsId:station.arsId,name:station.name},bus};};
 if(path==='/api/config'&&req.method==='GET')return json(200,{mode:transit.mode,region:'서울',pushReady:push.ready,publicKey:push.ready?push.keys.publicKey:null,subscribed:Boolean(device().subscription)});
 if(path==='/api/stations'&&req.method==='GET')return json(200,{stations:await transit.stations(url.searchParams.get('q'))});
 if(path==='/api/nearby'&&req.method==='GET')return json(200,{stations:await transit.nearby(Number(url.searchParams.get('lat')),Number(url.searchParams.get('lng')))});
 if(path==='/api/buses'&&req.method==='GET'){const station={id:url.searchParams.get('id'),arsId:url.searchParams.get('arsId')};if(!/^\d{1,12}$/.test(station.id)||!/^\d{1,12}$/.test(station.arsId))throw new AppError('정류장을 선택해 주세요.');return json(200,{buses:await transit.buses(station)});}
 if(path==='/api/routes'&&req.method==='GET')return json(200,{routes:device().routes.map(({alerts,...r})=>r)});
 if(path==='/api/routes'&&req.method==='POST'){const value=await canonical(await body());const route={...value,id:randomUUID(),createdAt:new Date().toISOString()};await store.transaction(d=>{const u=ensure(d);if(u.routes.length>=10)throw new AppError('경로는 10개까지 저장할 수 있어요.');u.routes.push(route);});return json(201,route);}
 const match=path.match(/^\/api\/routes\/([a-f0-9-]+)(\/arrival)?$/);
 if(match){const route=device().routes.find(r=>r.id===match[1]);if(!route)throw new AppError('저장된 경로를 찾지 못했어요.',404);
 if(match[2]&&req.method==='GET'){const info=await transit.arrival(route);return json(200,{...info,advice:departure(info.seconds,route.walkMinutes,route.bufferMinutes)});}
 if(!match[2]&&req.method==='PUT'){const v=await canonical(await body());await store.transaction(d=>{const u=ensure(d);const i=u.routes.findIndex(r=>r.id===route.id);if(i<0)throw new AppError('경로를 찾지 못했어요.',404);u.routes[i]={...route,...v,alerts:undefined};});return json(200,{...route,...v,alerts:undefined});}
 if(!match[2]&&req.method==='DELETE'){await store.transaction(d=>{ensure(d).routes=ensure(d).routes.filter(r=>r.id!==route.id);});return json(200,{ok:true});}}
 if(path==='/api/push/subscription'&&req.method==='POST'){if(!push.ready)throw new AppError('서버 알림 설정이 필요해요.',503);const subscription=validateSubscription(await body());await store.transaction(d=>{ensure(d).subscription=subscription;});return json(200,{ok:true});}
 if(path==='/api/push/subscription'&&req.method==='DELETE'){await store.transaction(d=>{ensure(d).subscription=null;});return json(200,{ok:true});}
 if(path==='/api/push/test'&&req.method==='POST'){if(!push.ready)throw new AppError('서버 알림 설정이 필요해요.',503);if(!device().subscription)throw new AppError('먼저 알림을 켜 주세요.');try{await push.send(device().subscription,{title:'미리타 알림이 연결됐어요',body:'출근길 알림을 이 기기에서 받을 수 있어요.',tag:'mirita-test',url:'/app'});}catch(e){if(e.status===404||e.status===410)await store.transaction(d=>{ensure(d).subscription=null;});throw new AppError('알림을 보내지 못했어요. 알림 연결을 다시 확인해 주세요.',502);}return json(200,{ok:true});}
 if(path==='/api/device'&&req.method==='DELETE'){await store.transaction(d=>{delete d.devices[deviceId];});res.setHeader('Set-Cookie','mirita_device=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(200,{ok:true});}
 throw new AppError('요청을 찾지 못했어요.',404);
 }catch(e){if(!res.headersSent)json(e instanceof AppError?e.status:500,{error:e instanceof AppError?e.message:'저장하지 못했어요. 입력 내용은 유지돼요. 다시 시도해 주세요.'});else res.end();}
 });server.requestTimeout=15000;server.headersTimeout=10000;return server;
}
