// All values are milliseconds since epoch; calendar arithmetic is explicitly Seoul time.
export function commuteWindow(route,now){
 const local=new Date(now+9*3600000);const [h,m]=route.time.split(':').map(Number);
 for(const offset of [-1,0,1]){const target=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+offset,h,m)-9*3600000;const date=new Date(target+9*3600000);if(route.days.includes(date.getUTCDay())&&now>=target-60*60000&&now<=target+15*60000)return {day:date.toISOString().slice(0,10),target};}
 return null;
}
export function nextWindow(route,now){
 const local=new Date(now+9*3600000);const [h,m]=route.time.split(':').map(Number);
 for(let offset=-1;offset<=7;offset++){const target=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+offset,h,m)-9*3600000;const date=new Date(target+9*3600000);if(route.days.includes(date.getUTCDay())&&target+15*60000>now)return Math.max(now+60000,target-60*60000);}
 return now+24*3600000;
}
export function selectArrival(candidates,target,vehicleId){
 const valid=candidates.filter(x=>x.vehicleId&&Number.isFinite(x.arrivalAt));
 if(vehicleId)return valid.find(x=>x.vehicleId===vehicleId)||null;
 return valid.filter(x=>Math.abs(x.arrivalAt-target)<=15*60000).sort((a,b)=>Math.abs(a.arrivalAt-target)-Math.abs(b.arrivalAt-target))[0]||null;
}
export function stageDecisions({now,createdAt,arrivalAt,events}){
 const seconds=(arrivalAt-now)/1000;
 return [30,15,5].flatMap(stage=>{
  const event=events.find(x=>x.stage===stage);if(event&&event.status!=='retry')return [];
  const threshold=stage*60;if(seconds>threshold)return [];
  const within=seconds>0&&threshold-seconds<=90;
  const existed=createdAt<=arrivalAt-threshold*1000;
  return [{stage,status:within&&existed?'send':'skipped'}];
 });
}
