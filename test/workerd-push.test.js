import test from 'node:test';import assert from 'node:assert/strict';import { build } from 'esbuild';import { Miniflare,convertV4MiniflareOptions } from 'miniflare';
import { createPublicKey,verify } from 'node:crypto';
test('workerd Web Push matches RFC vector and produces independently verifiable VAPID',async t=>{
 const source=`import {encrypt,generateKeys,authorization,Push} from './server/push.js';
 const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{auth:'BTBZMqHH6r4Tts7J_aSIgg',p256dh:'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'}};
 export default {async fetch(){const keys=generateKeys();let bytes=0;const push=new Push({...keys,subject:'mailto:hello@example.com',fetcher:async(url,options)=>{bytes=options.body.length;return new Response(null,{status:201});}});await push.send(sub,{title:'테스트'});return Response.json({bytes,publicKey:keys.publicKey,auth:authorization(sub.endpoint,keys,'mailto:hello@example.com',1000),vector:encrypt('When I grow up, I want to be a watermelon',sub,{salt:Buffer.from('DGv6ra1nlYgDCS1FRnbzlw','base64url'),privateKey:Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw','base64url')}).toString('base64url')});}};`;
 const out=await build({stdin:{contents:source,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'neutral',external:['node:*']});
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:out.outputFiles[0].text,compatibilityDate:'2026-10-27',compatibilityFlags:['nodejs_compat']}));t.after(()=>mf.dispose());
 const response=await mf.dispatchFetch('http://localhost/test');assert.equal(response.status,200,await response.clone().text());const result=await response.json();
 assert.equal(result.vector,'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');assert.ok(result.bytes>100);
 const [h,p,s]=result.auth.match(/t=([^,]+)/)[1].split('.');const raw=Buffer.from(result.publicKey,'base64url');const key=createPublicKey({key:{kty:'EC',crv:'P-256',x:raw.subarray(1,33).toString('base64url'),y:raw.subarray(33).toString('base64url')},format:'jwk'});assert.ok(verify('sha256',Buffer.from(h+'.'+p),{key,dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url')));
});
