export async function dispatchCron(env,now){
 // Each route is a separate RPC invocation, with its own CPU and D1 query budget.
 // Twenty RPCs plus one D1 read stay below the Free invocation subrequest limit.
 const {results}=await env.DB.prepare('SELECT r.id FROM routes r JOIN subscriptions s ON s.device_id=r.device_id WHERE r.next_check<=? ORDER BY r.next_check,r.id LIMIT ?').bind(now,20).all();
 const totals={checked:0,sent:0,skipped:0,errors:0,uncertain:0,dispatched:results.length};
 for(let i=0;i<results.length;i+=5){const batch=await Promise.allSettled(results.slice(i,i+5).map(row=>env.SCHEDULER.runRoute(row.id,now)));for(const result of batch){if(result.status==='rejected'){totals.errors++;continue;}for(const key of ['checked','sent','skipped','errors','uncertain'])totals[key]+=result.value[key]||0;}}
 return totals;
}
export async function cleanup(db,now){await db.batch([
 db.prepare('DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at<? LIMIT 1000)').bind(now),
 db.prepare('DELETE FROM transit_cache WHERE key IN (SELECT key FROM transit_cache WHERE expires_at<? LIMIT 1000)').bind(now),
 db.prepare('DELETE FROM commutes WHERE day<?').bind(new Date(now-30*86400000).toISOString().slice(0,10))
]);}
