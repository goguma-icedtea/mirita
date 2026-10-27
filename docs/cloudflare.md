# Cloudflare 연결·배포·운영

확인일: 2026-10-27. Workers + Static Assets + D1 + 매분 Cron + 서비스 바인딩 RPC. 모바일 클라이언트는 PWA다. 이 문서의 배포 절차와 실제 배포 성공은 구분한다. 현재 검증 상태는 [검증 기록](cloudflare-verification.md)을 확인한다.

## 1. 계정 연결

Cloudflare 무료 계정을 사용한다. 유료 요금제로 자동 전환하거나 결제 수단을 등록하는 스크립트는 없다. 이미 유료 계정이라면 그 계정의 사용량 과금 규칙이 적용되므로 무료 계정을 선택한다.

Codex 환경 설정의 비밀값 입력란에 `CLOUDFLARE_API_TOKEN`, 일반 환경변수에 `CLOUDFLARE_ACCOUNT_ID`를 저장한다. 계정 ID는 대시보드의 Workers & Pages 계정 정보에서 확인한다. API 토큰은 해당 계정에 한정하고 **Account → Workers Scripts: Edit**, **Account → D1: Edit**, 계정 조회가 필요하면 **Account Settings: Read**를 부여한다. 전역 API 키를 사용하지 않는다. 토큰을 채팅·저장소·명령 인수에 붙여 넣지 않는다.

내 컴퓨터에서 진행할 경우 Node.js 24 이상을 설치하고 다음을 실행한다.

```sh
npm ci
npm run cf:login
npm run cf:connect
```

OAuth가 여러 계정을 찾으면 원하는 계정을 선택하거나 `CLOUDFLARE_ACCOUNT_ID`를 환경변수로 지정한다. 클라우드의 비대화형 실행에는 계정 ID와 API 토큰 주입이 필요하다. 인증정보가 없으면 연결 명령은 오류로 종료하며 임시 계정이나 다른 계정을 만들지 않는다.

`cf:connect`는 지정 계정에서 `mirita-db`를 찾아 재사용한다. 없으면 아시아 태평양 위치 힌트로 생성한다. 리전 힌트는 한국 내 데이터 보관 보장이 아니다. 실제 DB ID를 Git에서 제외된 `.wrangler.deploy.json`에 저장한다. 기존 DB나 Worker를 삭제하지 않는다. 같은 계정에 이름이 같은 다른 프로젝트 DB/Worker가 있다면 먼저 `wrangler.jsonc`의 DB명·Worker명·SCHEDULER 서비스명을 모두 바꿔 충돌을 피한다. 기존 Node의 `data/db.json` 데이터는 자동 이관하지 않는다.

## 2. 체험 모드 배포

```sh
npm run cf:deploy
```

연결 확인 → 원격 D1 마이그레이션 → 번들 dry-run → Workers 배포 순서다. 원격 DB에는 미리 스키마가 적용되므로 이미 사용 중인 DB는 D1 Time Travel/내보내기 등 복구 수단을 확인하고 배포한다. 첫 마이그레이션은 새 테이블만 생성한다.

Wrangler가 출력한 실제 HTTPS 주소에서 다음을 확인한다. 주소를 추측해 만들지 않는다.

- `/healthz`: 상태 응답.
- `/api/config`: 키 미설정이면 `mode: demo`, `pushReady: false`.
- `/`: 소개 페이지, `/app`: PWA.
- `종로` 검색 → 정류장·143번 버스 선택 → 저장 → 새로고침 → 수정·삭제.

`wrangler.jsonc`의 0으로 된 DB ID는 로컬 개발 전용 표식이다. 직접 `wrangler deploy`로 배포하지 말고 실제 ID를 연결하는 `cf:deploy`를 사용한다. 자동 생성 파일에는 인증 토큰을 기록하지 않는다.

사용자 도메인이 없어도 제공되는 `workers.dev` HTTPS로 검증할 수 있다. Cloudflare 계정에서 Workers 서브도메인 활성화를 요구하면 대시보드에서 설정한다. 새 Cron의 반영은 최대 15분 걸릴 수 있다. 게시된 주소와 다른 Origin에서 쓰기 요청을 허용하지 않는다. `APP_ORIGIN`을 등록했다면 정확히 일치하도록 설정하고 로컬 주소를 운영에 등록하지 않는다. 미설정이면 현재 요청 Origin을 사용한다.

## 3. 실제 버스와 푸시 연결

공공데이터포털에서 서울특별시 정류소정보조회·버스도착정보조회 두 서비스에 사용할 수 있는 **Decoding 키**를 발급한다. 승인된 호출량과 이용 조건은 개인 서비스 승인 화면에서 확인한다. 키가 없으면 명시적 체험 모드로 개발한다.

```sh
node scripts/wrangler.mjs secret put SEOUL_BUS_API_KEY --config .wrangler.deploy.json
npm run cf:push -- mailto:실제운영자이메일
```

첫 명령의 비공개 입력 프롬프트에 API 키를 입력한다. 두 번째 명령은 VAPID 키를 메모리에서 생성해 Cloudflare Secrets에 직접 등록한다. 비밀키를 출력하거나 파일로 저장하지 않는다. 이미 양쪽 키가 있으면 유지한다. 한쪽 키만 있으면 자동 교체하지 않고 중단한다. 운영자 이메일은 실제 주소로 바꾼다. 키를 교체하면 기존 구독은 재연결이 필요하다.

비밀값 등록은 Worker 새 버전을 배포할 수 있다. 등록 후 다시 `/api/config`를 확인한다. 서울 API 키가 있으면 `live`, VAPID 키·subject가 유효하면 `pushReady: true`여야 한다. 실제 정류장을 찾아 실제 도착 정보가 오는지 확인하고 실패 시 체험 데이터로 바꾸지 않는다.

운영 Worker의 외부 연결 대상은 `ws.bus.go.kr`, Google FCM, Mozilla Push, Apple Push다. 브라우저에는 API 키·VAPID 비밀키·Cloudflare 토큰을 내려주지 않는다. Codex 환경의 네트워크 허용목록과 Cloudflare 운영 네트워크는 별개다.

## 4. PWA 설치와 실기기 검증

- Android: 배포 HTTPS 주소를 Chrome에서 열고 브라우저 메뉴의 앱 설치/홈 화면 추가를 사용한다. 미리타 설정 → 알림 연결 → 테스트 알림을 선택한다.
- iPhone/iPad: Web Push를 지원하는 OS(지원 도입은 iOS/iPadOS 16.4)에서 Safari 공유 → 홈 화면에 추가 후 **홈 화면의 웹앱**을 열고 사용자 버튼으로 알림 권한을 요청한다. 최신 OS/브라우저 정책은 배포 시 다시 확인한다.
- 각 기기에서 앱을 연 상태·백그라운드·화면 잠금 상태를 따로 확인한다. 테스트 API 성공은 푸시 서비스의 전송 수락이지 휴대폰 수신 증명이 아니다.
- 권한 거부/철회 후 알림 연결 상태, 재연결, 기기 설정에서 권한 복구, 전체 데이터 삭제를 확인한다.
- 오프라인 앱 셸은 열 수 있지만 서버 저장·버스 갱신은 인터넷이 필요하다. 오프라인 저장 완료로 표시하지 않는다.

실제 기기 모델·OS·브라우저·설치 상태·요청 시각·수신 시각·결과를 기록한다. 가능하면 실제 출근 일정에서 30/15/5단계도 기록한다. 실시간 예측이 30분 전에 제공되지 않으면 그 단계는 미발송으로 남긴다.

## 5. 알림 계산과 전달 범위

목표 탑승 시각 전 60분부터 15분 후까지 서울 시간으로 관찰한다. API의 첫째·둘째 예측 중 목표 ±15분 이내에서 가까운 차량을 선택하고 차량 ID로 고정한다. 선택한 차량이 사라지면 다른 버스를 같은 차량처럼 사용하지 않는다. 차량 식별 정보가 없으면 자동 알림을 보내지 않는다.

3단계는 **버스 도착 예측 기준** 30/15/5분이다. 출발 예상은 예측 도착−도보−여유이며 별도 화면 정보다. 지연된 Cron이나 예측 급변으로 단계가 지나면 한꺼번에 발송하지 않는다. 단계별 90초 허용 창, 경로 저장 시각, 같은 경로·서울 탑승일·단계 이력을 적용한다. 설정 시각 기반 안내로 몰래 대체하지 않는다. 휴대폰 도착 시각은 보장하지 않는다.

D1 claim으로 중복 실행을 막고 route/subscription revision을 전송 직전 재확인한다. 전송을 시작한 뒤 삭제/해제한 메시지는 취소할 수 없다. 성공 기록 전 프로세스가 중단되거나 네트워크 결과가 불명확하면 자동 재발송하지 않는다. `sending`/`uncertain`은 수신 성공으로 표시하지 않는다. 명시적 HTTP 429/5xx 거절만 허용 창 안에서 재시도한다. 404/410 구독은 해당 revision일 때만 제거한다.

경로 삭제/기기 데이터 삭제는 연관 일정·이력·구독을 cascade 정리한다. 구독 해제는 경로를 유지하며 새 푸시를 중단한다. 발송 이력은 재연결로 같은 날 중복 알림이 생기지 않게 유지하고 30일 뒤 정리한다. 로그인 없이 쿠키를 지우면 기존 저장 경로에 접근할 수 없으므로 삭제 전에 앱의 전체 데이터 삭제 기능을 사용한다.

## 6. 무료 한도와 처리 규모

공식 Cloudflare 문서 원본을 2026-10-27에 확인했다. 한도는 계정 내 다른 Worker/DB 사용량과 합산되며 향후 변경될 수 있다.

| 항목 | 확인한 Workers Free/D1 Free 한도 |
| --- | --- |
| 동적 요청 | 100,000/일, 정적 자산 요청은 별도 무료 |
| CPU | HTTP·Cron 실행당 10ms |
| 외부 subrequest | 실행당 50회 |
| D1 쿼리 | 실행당 50회, batch 호출은 1회로 계산 |
| D1 읽기·쓰기 | 읽기 500만 행/일, 쓰기 10만 행/일 |
| D1 저장 | 계정 총 5GB, DB 하나당 500MB |

Cron은 매분 1회(1,440회/일)이고, 한 번에 최대 20개 due 경로를 RPC로 분리한다. 각 RPC는 경로 하나를 처리해 D1 쿼리 한도와 CPU 예산을 분리한다. 20개가 넘게 동시 관찰 대상이면 다음 분으로 밀릴 수 있다. 실제 CPU 10ms 충족은 배포 Metrics에서 확인해야 한다. 로컬 workerd 성공이 무료 CPU 충족 증거는 아니다. 초과 시 사용자 동의 없이 유료로 전환하지 않는다.

하루 일정 한 개의 관찰 구간은 최대 76번 조회다. API 도착 조회의 상한 근사는 `활성 사용자 수 × 하루 경로 수 × 76`이며, 동일 정류장·노선 캐시 공유(15초)는 실제 횟수를 줄일 수 있다. 예: 1명·1경로는 76회/일, 10명·1경로는 760회/일, 10명·2경로는 1,520회/일. 검색·수동 새로고침은 별도다. 공급자 승인 한도가 이 값을 허용하는지 실제 계정에서 확인해야 한다.

D1은 관찰 중 상태 갱신·rate limit·캐시·인덱스 때문에 API 조회 한 번에 여러 행을 쓴다. 보수적 초기 예산은 경로 일정당 2,000행 쓰기 + 사용자 API 호출당 최대 수십 행으로 잡고 실제 `rows_written`으로 보정한다. 10명·2경로는 관찰 쓰기 약 4만 행/일의 예산이며 무료 보장이 아니다. 한도 초과 시 D1 Free는 오류를 반환한다. 무제한 운영을 약속하지 않는다.

## 7. 로그·장애·재배포

```sh
npm run cf:tail
npm run cf:deploy
```

Workers 대시보드 Metrics에서 오류·CPU·요청 수, D1 Metrics에서 rows read/written·저장량을 확인한다. Cron 로그의 `event: scheduler`, `dispatched`, `checked`, `sent`, `skipped`, `errors`, `uncertain`을 확인한다. 로그에는 키·사용자 경로·구독 endpoint를 넣지 않는다. Cron 배포 후 실제 이벤트가 실행되었는지 확인한다.

- `mode: demo`: 서울 키가 운영 Secrets에 설정됐는지 확인한다.
- `pushReady: false`: VAPID 세 값과 키 쌍을 확인한다.
- API 오류: 해당 API 키가 두 서울 서비스에 승인됐는지, 공급자 제한·데이터 상태를 확인한다.
- `Worker exceeded resource limits`/1102: CPU Metrics와 D1 쿼리·subrequest 제한을 확인한다. 배치·암호화 경량화 등 무료 개선을 먼저 검토한다.
- 경로 저장 오류: `cf:connect`, 원격 마이그레이션 결과, 올바른 계정/DB 바인딩을 확인한다.
- 알림 누락: 기기 권한·구독·OS 정책, 선택 차량과 단계 창, Cron 지연, `sending`/`uncertain` 이력을 구분한다. 이력을 삭제해 무작정 재발송하지 않는다.

## 출처

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/
- 공식 문서 GitHub 원본: https://github.com/cloudflare/cloudflare-docs/tree/production/src/content
- iOS 조건 안내: https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ (현재 환경에서는 원문 접근이 차단되어 최신 본문 재확인은 보류)
- 서울 API: https://www.data.go.kr/data/15000303/openapi.do · https://www.data.go.kr/data/15000314/openapi.do (실제 응답·승인별 한도는 키 입력 후 검증)
