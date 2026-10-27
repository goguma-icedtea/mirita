import { commuteWindow, nextWindow, selectArrival, stageDecisions } from './schedule.js';
export async function runCloudTick({repo,transit,push,now=Date.now(),clock=()=>now,batchSize=1,routeId=null}){
 const stats={checked:0,sent:0,skipped:0,errors:0,uncertain:0};if(transit.mode!=='live'||!push.ready)return stats;
 const db=repo.db;const limit=Math.max(1,Math.min(2,Number(batchSize)||2));
 const {results:rows}=await db.prepare('SELECT r.*,s.data AS subscription,s.revision AS sub_revision,s.eligible_at AS sub_eligible_at FROM routes r JOIN subscriptions s ON s.device_id=r.device_id WHERE r.next_check<=?'+(routeId?' AND r.id=?':'')+' ORDER BY r.next_check,r.id LIMIT ?').bind(...(routeId?[now,routeId,1]:[now,limit])).all();
 for(const row of rows){now=clock();const route=JSON.parse(row.data);const window=route.enabled?commuteWindow(route,now):null;
  const claimed=await db.prepare('UPDATE routes SET next_check=? WHERE id=? AND revision=? AND next_check=?').bind(window?now+60000:nextWindow(route,now),row.id,row.revision,row.next_check).run();if(!claimed.meta.changes||!window)continue;stats.checked++;
  try{
   const info=await transit.arrival(route);now=clock();const observed=Date.parse(info.updatedAt);if(info.mode!=='live'||!Number.isFinite(observed)||now-observed>90000||observed>now+5000)continue;
   await db.prepare('INSERT OR IGNORE INTO commutes(route_id,day) SELECT id,? FROM routes WHERE id=? AND revision=?').bind(window.day,row.id,row.revision).run();
   let commute=await db.prepare('SELECT * FROM commutes WHERE route_id=? AND day=?').bind(row.id,window.day).first();if(!commute)continue;
   const candidate=selectArrival(info.candidates||[],window.target,commute.vehicle_id);
   if(!candidate||candidate.arrivalAt<=now){await db.prepare('UPDATE commutes SET status=?,checked_at=? WHERE route_id=? AND day=? AND EXISTS(SELECT 1 FROM routes WHERE id=? AND revision=?)').bind(commute.vehicle_id?'unavailable':'waiting',now,row.id,window.day,row.id,row.revision).run();continue;}
   await db.prepare('UPDATE commutes SET vehicle_id=COALESCE(vehicle_id,?),arrival_at=?,checked_at=?,status=? WHERE route_id=? AND day=? AND EXISTS(SELECT 1 FROM routes WHERE id=? AND revision=?)').bind(candidate.vehicleId,candidate.arrivalAt,now,'tracking',row.id,window.day,row.id,row.revision).run();
   commute=await db.prepare('SELECT * FROM commutes WHERE route_id=? AND day=?').bind(row.id,window.day).first();if(commute.vehicle_id!==candidate.vehicleId)continue;
   const {results:events}=await db.prepare('SELECT stage,status FROM notification_events WHERE route_id=? AND day=?').bind(row.id,window.day).all();
   for(const decision of stageDecisions({now,createdAt:Math.max(Date.parse(route.createdAt),row.eligible_at,row.sub_eligible_at),arrivalAt:candidate.arrivalAt,events})){
    const claim=crypto.randomUUID();const status=decision.status==='send'?'sending':'skipped';
    const result=await db.prepare(`INSERT INTO notification_events(route_id,day,stage,status,claim,updated_at)
     SELECT r.id,?,?,?,?,? FROM routes r JOIN subscriptions s ON s.device_id=r.device_id WHERE r.id=? AND r.revision=? AND s.revision=?
     ON CONFLICT(route_id,day,stage) DO UPDATE SET status=excluded.status,claim=excluded.claim,updated_at=excluded.updated_at WHERE notification_events.status='retry'`).bind(window.day,decision.stage,status,claim,now,row.id,row.revision,row.sub_revision).run();
    if(!result.meta.changes)continue;if(status==='skipped'){stats.skipped++;continue;}
    const current=await db.prepare('SELECT r.id FROM routes r JOIN subscriptions s ON s.device_id=r.device_id WHERE r.id=? AND r.revision=? AND s.revision=?').bind(row.id,row.revision,row.sub_revision).first();
    if(!current){await finish(db,row.id,window.day,decision.stage,claim,'skipped',now);continue;}
    try{
     const left=candidate.arrivalAt-(route.walkMinutes+route.bufferMinutes)*60000;
     const time=new Date(left).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false});
     await push.send(JSON.parse(row.subscription),{title:`버스 도착 약 ${Math.ceil((candidate.arrivalAt-now)/60000)}분 전`,body:`${route.bus.name}번 · ${route.station.name} · ${time} 출발 예상${left<now?' · 출발 시각이 지났어요':''}`,tag:`mirita-${row.id}-${window.day}-${decision.stage}`,url:'/app'});
     await finish(db,row.id,window.day,decision.stage,claim,'sent',now);stats.sent++;
    }catch(e){
     const definitive=Number.isInteger(e.status);const retry=definitive&&(e.status===429||e.status>=500);const outcome=retry?'retry':definitive?'skipped':'uncertain';
     await finish(db,row.id,window.day,decision.stage,claim,outcome,now);stats.errors++;if(outcome==='uncertain')stats.uncertain++;
     if([404,410].includes(e.status))await repo.unsubscribe(row.device_id,row.sub_revision);
    }
   }
  }catch{stats.errors++;}
 }

 return stats;
}
async function finish(db,id,day,stage,claim,status,now){await db.prepare('UPDATE notification_events SET status=?,updated_at=? WHERE route_id=? AND day=? AND stage=? AND claim=?').bind(status,now,id,day,stage,claim).run();}
