import { AppError, notificationKey } from '../server/domain.js';
export class Repository {
 constructor(db,{clock=Date.now}={}){this.db=db;this.clock=clock;}
 async routes(device){return (await this.db.prepare('SELECT data FROM routes WHERE device_id=? ORDER BY updated_at,id').bind(device).all()).results.map(x=>JSON.parse(x.data));}
 async route(device,id){const r=await this.db.prepare('SELECT * FROM routes WHERE device_id=? AND id=?').bind(device,id).first();return r?{...r,value:JSON.parse(r.data)}:null;}
 async save(device,value,id){
  const now=this.clock();
  if(id){
   const old=await this.route(device,id);if(!old)throw new AppError('경로를 찾지 못했어요.',404);
   const changed=notificationKey(old.value)!==notificationKey(value)||(!old.value.enabled&&value.enabled);
   const statements=[this.db.prepare('UPDATE routes SET data=?,revision=revision+1,next_check=?,updated_at=?,eligible_at=? WHERE device_id=? AND id=? AND revision=?').bind(JSON.stringify(value),now,now,changed?now:old.eligible_at,device,id,old.revision)];
   if(changed)statements.push(this.db.prepare("UPDATE commutes SET vehicle_id=NULL,arrival_at=NULL,checked_at=NULL,status='monitoring' WHERE route_id=? AND EXISTS(SELECT 1 FROM routes WHERE id=? AND device_id=? AND revision=?)").bind(id,id,device,old.revision+1));
   const [result]=await this.db.batch(statements);if(!result.meta.changes)throw new AppError('경로가 변경됐어요. 새로고침 후 다시 시도해 주세요.',409);
  }else{try{await this.db.batch([this.db.prepare('INSERT OR IGNORE INTO devices VALUES (?,?)').bind(device,now),this.db.prepare('INSERT INTO routes(id,device_id,data,next_check,updated_at,eligible_at) VALUES (?,?,?,?,?,?)').bind(value.id,device,JSON.stringify(value),now,now,now)]);}catch(e){if(String(e.cause?.message||e.message).includes('route_limit'))throw new AppError('경로는 10개까지 저장할 수 있어요.');throw e;}}
  return value;
 }

 async remove(device,id){const r=await this.db.prepare('DELETE FROM routes WHERE device_id=? AND id=?').bind(device,id).run();if(!r.meta.changes)throw new AppError('경로를 찾지 못했어요.',404);}
 async subscription(device){return this.db.prepare('SELECT * FROM subscriptions WHERE device_id=?').bind(device).first();}
 async subscribe(device,subscription){const now=this.clock();await this.db.batch([this.db.prepare('INSERT OR IGNORE INTO devices VALUES (?,?)').bind(device,now),this.db.prepare(`INSERT INTO subscriptions(device_id,data,revision,eligible_at) VALUES (?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET revision=CASE WHEN subscriptions.data<>excluded.data THEN excluded.revision ELSE subscriptions.revision END,eligible_at=CASE WHEN subscriptions.data<>excluded.data THEN excluded.eligible_at ELSE subscriptions.eligible_at END,data=excluded.data`).bind(device,JSON.stringify(subscription),crypto.randomUUID(),now)]);}

 async unsubscribe(device,revision){await this.db.prepare('DELETE FROM subscriptions WHERE device_id=?'+(revision?' AND revision=?':'')).bind(...(revision?[device,revision]:[device])).run();}
 async deleteDevice(device){await this.db.prepare('DELETE FROM devices WHERE id=?').bind(device).run();}
 async budget(key,max,now=Date.now()){
  const row=await this.db.prepare('INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING count').bind(key,now+60000,now,now).first();
  if(row.count>max)throw new AppError('잠시 후 다시 시도해 주세요.',429);
 }
}
export async function hash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
