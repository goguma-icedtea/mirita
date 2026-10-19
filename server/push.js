import { createECDH, createHmac, createCipheriv, createPrivateKey, sign, randomBytes, ECDH } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { AppError } from './domain.js';
const b64=x=>x.toString('base64url');
const decode=x=>Buffer.from(x,'base64url');
export function generateKeys(){const ec=createECDH('prime256v1');ec.generateKeys();return {publicKey:b64(ec.getPublicKey()),privateKey:b64(ec.getPrivateKey())};}
export function validateSubscription(sub){
 try{const u=new URL(sub.endpoint);const host=u.hostname;const allowed=['fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com','web.push.apple.com'].includes(host)||host.endsWith('.push.apple.com');
 if(!allowed||u.protocol!=='https:'||u.port||u.username||u.password||u.hash||sub.endpoint.length>2048)throw Error();
 const pub=decode(sub.keys.p256dh),auth=decode(sub.keys.auth);if(pub.length!==65||pub[0]!==4||auth.length!==16)throw Error();ECDH.convertKey(pub,'prime256v1');
 return {endpoint:u.href,keys:{p256dh:b64(pub),auth:b64(auth)}};
 }catch{throw new AppError('이 브라우저의 알림 구독 정보를 확인하지 못했어요.');}
}
export function encrypt(payload,sub,{salt=randomBytes(16),privateKey}={}){
 const plain=Buffer.from(payload);if(plain.length>3993)throw new AppError('알림 내용이 너무 길어요.');
 const ec=createECDH('prime256v1');if(privateKey)ec.setPrivateKey(privateKey);else ec.generateKeys();const pub=ec.getPublicKey(),ua=decode(sub.keys.p256dh);
 const hmac=(key,data)=>createHmac('sha256',key).update(data).digest();
 const prkKey=hmac(decode(sub.keys.auth),ec.computeSecret(ua));
 const ikm=hmac(prkKey,Buffer.concat([Buffer.from('WebPush: info\0'),ua,pub,Buffer.from([1])]));
 const prk=hmac(salt,ikm);const cek=hmac(prk,Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0,16);const nonce=hmac(prk,Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0,12);
 const cipher=createCipheriv('aes-128-gcm',cek,nonce);const encrypted=Buffer.concat([cipher.update(Buffer.concat([plain,Buffer.from([2])])),cipher.final(),cipher.getAuthTag()]);
 const header=Buffer.alloc(21);salt.copy(header);header.writeUInt32BE(4096,16);header[20]=65;return Buffer.concat([header,pub,encrypted]);
}
export function authorization(endpoint,keys,subject,now=Math.floor(Date.now()/1000)){
 const pub=decode(keys.publicKey);const jwk={kty:'EC',crv:'P-256',x:b64(pub.subarray(1,33)),y:b64(pub.subarray(33)),d:keys.privateKey};
 const token=[{typ:'JWT',alg:'ES256'},{aud:new URL(endpoint).origin,exp:now+43200,sub:subject}].map(x=>b64(Buffer.from(JSON.stringify(x)))).join('.');
 const signature=sign('sha256',Buffer.from(token),{key:createPrivateKey({key:jwk,format:'jwk'}),dsaEncoding:'ieee-p1363'});return `vapid t=${token}.${b64(signature)}, k=${keys.publicKey}`;
}
export class Push {
 constructor({publicKey='',privateKey='',subject='',fetcher=fetch}={}){this.keys={publicKey,privateKey};this.subject=subject;this.fetcher=fetcher;this.ready=Boolean(publicKey&&privateKey&&/^(mailto:|https:\/\/)/.test(subject));if(this.ready)authorization('https://fcm.googleapis.com',this.keys,this.subject);}
 async send(subscription,message){if(!this.ready)throw new AppError('서버 알림 설정이 필요해요.',503);const sub=validateSubscription(subscription);const response=await this.fetcher(sub.endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:authorization(sub.endpoint,this.keys,this.subject),'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:'60',Urgency:'high'},body:encrypt(JSON.stringify(message),sub)});if(!response.ok){const error=new AppError('알림 서비스가 응답하지 않았어요.',502);error.status=response.status;throw error;}}
}
if(process.argv[2]==='--generate-keys'&&import.meta.url===pathToFileURL(process.argv[1]).href){const keys=generateKeys();console.log('VAPID_PUBLIC_KEY='+keys.publicKey+'\nVAPID_PRIVATE_KEY='+keys.privateKey+'\nVAPID_SUBJECT=mailto:your-email@example.com');}
