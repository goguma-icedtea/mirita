const running=new WeakSet();
export function monitoringWindow(route,now){
 // UTC getters on an offset copy avoid depending on the server's local timezone.
 const local=new Date(now.getTime()+9*3600000);const minute=local.getUTCHours()*60+local.getUTCMinutes();const [h,m]=route.time.split(':').map(Number);let diff=h*60+m-minute;const target=new Date(local);if(diff<0){diff+=1440;target.setUTCDate(target.getUTCDate()+1);}if(diff>60||!route.days.includes(target.getUTCDay()))return null;return target.toISOString().slice(0,10);
}
export async function runTick({store,transit,push,now=new Date()}){
 const stats={sent:0,errors:0};if(running.has(store)||transit.mode!=='live'||!push.ready)return stats;running.add(store);
 try{for(const [deviceId,device] of Object.entries(store.read().devices)){if(!device.subscription)continue;for(const route of device.routes){if(!route.enabled)continue;const day=monitoringWindow(route,now);if(!day)continue;
 try{const info=await transit.arrival(route);const sec=info.seconds;if(info.mode!=='live'||!Number.isFinite(sec)||sec<=0||sec>1800||sec<route.walkMinutes*60)continue;
 const current=store.read().devices[deviceId];const latest=current?.routes.find(r=>r.id===route.id);if(!latest?.enabled||!current.subscription||JSON.stringify(latest)!==JSON.stringify(route)||JSON.stringify(current.subscription)!==JSON.stringify(device.subscription))continue;
 const stage=sec<=(route.walkMinutes+route.bufferMinutes)*60?'leave':'ready';const alerts=route.alerts?.day===day?route.alerts.sent:[];if(alerts.includes(stage)||alerts.includes('leave'))continue;
 await push.send(current.subscription,{title:stage==='leave'?'이제 출발할 시간이에요':'버스 도착 시간을 확인해 주세요',body:`${route.bus.name}번 · ${route.station.name} · 약 ${Math.ceil(sec/60)}분 후 도착`,tag:`mirita-${route.id}-${day}-${stage}`,url:'/app'});
 await store.transaction(d=>{const r=d.devices[deviceId]?.routes.find(r=>r.id===route.id);if(r)r.alerts={day,sent:[...alerts,stage]};});stats.sent++;
 }catch(e){stats.errors++;if(e.status===404||e.status===410)await store.transaction(d=>{if(d.devices[deviceId])d.devices[deviceId].subscription=null;});}
 }}}finally{running.delete(store);}return stats;
}
