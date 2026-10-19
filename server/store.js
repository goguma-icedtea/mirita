import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export class Store {
 constructor(path,data){this.path=path;this.data=data;this.queue=Promise.resolve();}
 static async open(path){await mkdir(dirname(path),{recursive:true,mode:0o700});let data;try{data=JSON.parse(await readFile(path,'utf8'));if(!data||typeof data.devices!=='object'||Array.isArray(data.devices))throw Error('Invalid data store');}catch(e){if(e.code!=='ENOENT')throw e;data={devices:{}};}return new Store(path,data);}
 read(){return structuredClone(this.data);}
 transaction(fn){const run=this.queue.then(async()=>{const next=this.read();const result=await fn(next);const temporary=this.path+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(next),{mode:0o600});await rename(temporary,this.path);this.data=next;return result;});this.queue=run.catch(()=>{});return run;}
}
