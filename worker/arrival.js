import { departure } from '../server/domain.js';
import { commuteWindow, selectArrival, stageDecisions } from './schedule.js';
export async function arrivalView(repo,transit,row,clock=Date.now){
 const route=row.value;
 const info=await transit.arrival(route);const now=clock();const window=commuteWindow(route,now);
 const commute=window?await repo.db.prepare('SELECT * FROM commutes WHERE route_id=? AND day=?').bind(route.id,window.day).first():null;
 const events=window?(await repo.db.prepare('SELECT stage,status FROM notification_events WHERE route_id=? AND day=? ORDER BY stage DESC').bind(route.id,window.day).all()).results:[];
 const observed=Date.parse(info.updatedAt);const stale=!Number.isFinite(observed)||now-observed>90000;
 const selected=info.mode==='demo'?info.candidates?.[0]:window?selectArrival(info.candidates||[],window.target,commute?.vehicle_id):null;
 const seconds=!stale&&selected?Math.max(0,Math.ceil((selected.arrivalAt-now)/1000)):null;
 const sub=await repo.subscription(row.device_id);
 const decisions=selected?stageDecisions({now,createdAt:Math.max(Date.parse(route.createdAt),row.eligible_at||0,sub?.eligible_at||0),arrivalAt:selected.arrivalAt,events}):[];
 const nextStage=info.mode==='live'&&!stale&&route.enabled&&selected?[30,15,5].find(stage=>!events.some(x=>x.stage===stage&&x.status!=='retry')&&!decisions.some(x=>x.stage===stage&&x.status==='skipped'))??null:null;
 return {...info,seconds,advice:departure(seconds,route.walkMinutes,route.bufferMinutes),arrivalAt:selected?.arrivalAt??null,leaveAt:selected?selected.arrivalAt-(route.walkMinutes+route.bufferMinutes)*60000:null,targetAt:window?.target??null,trackingStatus:stale?'stale':info.mode==='demo'?'demo':!window?'outside-window':selected?'tracking':commute?.vehicle_id?'unavailable':'waiting',notification:{events,nextStage}};
}
