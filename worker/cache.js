// Only public transit responses go here. Neither keys nor subscription data are cached.
export class TransitCache {
 constructor(db){this.db=db;}
 async get(key){const row=await this.db.prepare('SELECT data FROM transit_cache WHERE key=? AND expires_at>?').bind(key,Date.now()).first();return row?JSON.parse(row.data):undefined;}
 async set(key,value){await this.db.prepare('INSERT INTO transit_cache VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at').bind(key,JSON.stringify(value),value.exp).run();}
}
