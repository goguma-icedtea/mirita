import test from 'node:test';import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { encrypt, generateKeys, authorization, validateSubscription, Push } from '../server/push.js';
const sub={endpoint:'https://fcm.googleapis.com/fcm/send/test',keys:{auth:'BTBZMqHH6r4Tts7J_aSIgg',p256dh:'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'}};
test('encrypt matches RFC8291 section 5 independent published vector',()=>{
 const result=encrypt('When I grow up, I want to be a watermelon',sub,{salt:Buffer.from('DGv6ra1nlYgDCS1FRnbzlw','base64url'),privateKey:Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw','base64url')});
 assert.equal(result.toString('base64url'),'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});
test('VAPID JWT has correct audience, expiry and verifiable ES256 signature',()=>{
 const keys=generateKeys();const header=authorization(sub.endpoint,keys,'mailto:hello@example.com',1000);const token=header.match(/t=([^,]+)/)[1];const [h,p,s]=token.split('.');const claims=JSON.parse(Buffer.from(p,'base64url'));assert.equal(claims.aud,'https://fcm.googleapis.com');assert.equal(claims.exp,1000+43200);
 const raw=Buffer.from(keys.publicKey,'base64url');const pub=createPublicKey({key:{kty:'EC',crv:'P-256',x:raw.subarray(1,33).toString('base64url'),y:raw.subarray(33).toString('base64url')},format:'jwk'});assert.ok(verify('sha256',Buffer.from(h+'.'+p),{key:pub,dsaEncoding:'ieee-p1363'},Buffer.from(s,'base64url')));
});
test('push subscriptions reject arbitrary URLs, redirects and malformed keys',async()=>{
 for(const endpoint of ['http://fcm.googleapis.com/x','https://localhost/x','https://fcm.googleapis.com.evil.test/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x'])assert.throws(()=>validateSubscription({...sub,endpoint}));
 assert.throws(()=>validateSubscription({...sub,keys:{auth:'bad',p256dh:'bad'}}));assert.ok(validateSubscription(sub));
 let options;const p=new Push({...generateKeys(),subject:'mailto:hello@example.com',fetcher:async(url,o)=>{options=o;return new Response(null,{status:410});}});await assert.rejects(p.send(sub,{title:'미리타'}),e=>e.status===410);assert.equal(options.redirect,'error');assert.equal(options.headers['Content-Encoding'],'aes128gcm');
});
