import { spawn } from 'node:child_process';import { generateKeys } from '../server/push.js';
const subject=process.argv[2];
function run(args,input){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/wrangler.mjs',...args,'--config','.wrangler.deploy.json'],{stdio:[input?'pipe':'inherit','pipe','inherit'],env:process.env});let out='';child.stdout.on('data',x=>out+=x);if(input)child.stdin.end(input);child.on('error',reject);child.on('exit',code=>code===0?resolve(out):reject(Error('Cloudflare 비밀값 설정에 실패했어요. 기존 키를 임의로 교체하지 마세요.')));});}
try{
 if(!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject||''))throw Error('사용법: npm run cf:push -- mailto:실제운영자이메일');
 const names=JSON.parse(await run(['secret','list'])).map(x=>x.name);const hasPublic=names.includes('VAPID_PUBLIC_KEY'),hasPrivate=names.includes('VAPID_PRIVATE_KEY');
 if(hasPublic!==hasPrivate)throw Error('서버에 VAPID 키 중 하나만 있어요. 기존 키 쌍을 복구한 뒤 다시 실행해 주세요. 자동으로 교체하지 않아요.');
 if(hasPublic){await run(['secret','put','VAPID_SUBJECT'],subject);console.log('기존 VAPID 키를 유지하고 운영자 연락처를 설정했어요.');}
 else{const keys=generateKeys();await run(['secret','bulk'],JSON.stringify({VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey,VAPID_SUBJECT:subject}));console.log('VAPID 키를 생성해 Cloudflare에 등록했어요. 비밀키는 출력하거나 파일로 저장하지 않았어요.');}
 console.log('PWA에서 알림 연결 → 테스트 알림을 선택하고 실제 휴대폰 수신을 확인해 주세요.');
}catch(e){console.error(e.message);process.exitCode=1;}
