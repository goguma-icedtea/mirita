# 미리타 · MIRITA

버스의 도착 예상과 정류장까지 걸리는 시간을 함께 보고, 집에서 나갈 시점을 안내하는 모바일 PWA입니다. 서울 버스를 우선 지원하며 가입 없이 기기별 경로를 저장합니다.

운영 구조는 **Cloudflare Workers + Static Assets + D1 + Cron + Web Push**입니다. Node 파일 서버는 기존 구현 회귀 검증용으로 남겨 두었습니다.

## 로컬 실행

Node.js 24 이상이 필요합니다.

```sh
npm ci
cp .dev.vars.example .dev.vars # 기존 파일이 있으면 덮어쓰지 마세요.
npm run db:migrate:local
npm start
```

- `/app`: 미리타 PWA, `/`: 소개 페이지, `/healthz`: 상태 확인.
- 기본 포트는 3000입니다. `npm start`와 `npm run dev`는 로컬 Workers(workerd)를 실행합니다.
- 키가 없으면 **체험 모드**입니다. `종로` 또는 `광화문`을 검색하면 샘플 정류장·버스를 선택할 수 있습니다. 경로는 실제 로컬 D1에 저장되지만 도착 정보는 예시이며 자동 버스 알림은 발송하지 않습니다.
- 로컬 D1은 Git에서 제외된 `.wrangler/state`에 남습니다. 기존 Node의 `data/db.json`은 자동 이관하지 않습니다.
- `.dev.vars`는 로컬 비밀값입니다. 없으면 Wrangler가 `.env`를 읽을 수도 있으므로 기존 운영·Node 설정과 분리하세요. 배포 서버의 Secrets는 별도로 등록해야 합니다.

## Cloudflare 연결과 배포

자세한 계정·토큰 설정은 [Cloudflare 안내](docs/cloudflare.md)를 확인하세요. 이미 인증했다면 다음 명령으로 연결하고 배포합니다.

```sh
npm run cf:connect
npm run cf:deploy
```

`cf:connect`는 계정의 `mirita-db`를 재사용하거나 생성하고 실제 바인딩을 `.wrangler.deploy.json`에 저장합니다. `cf:deploy`는 원격 마이그레이션·번들 검사·Workers 배포를 실행합니다. Cloudflare가 출력한 실제 HTTPS 주소에서 확인하세요. 인증 전에는 배포되지 않습니다.

로컬 컴퓨터에서는 `npm run cf:login`으로 로그인할 수 있습니다. Codex 환경에서는 `CLOUDFLARE_ACCOUNT_ID`와 `CLOUDFLARE_API_TOKEN`을 환경 설정에 안전하게 저장하세요. 비밀값을 채팅이나 저장소에 붙이지 마세요.

## 실제 버스·휴대폰 알림

[공공데이터포털](https://www.data.go.kr/)에서 서울특별시 정류소정보조회·버스도착정보조회 서비스에 승인된 Decoding 키가 필요합니다. 배포 연결 후 입력합니다.

```sh
node scripts/wrangler.mjs secret put SEOUL_BUS_API_KEY --config .wrangler.deploy.json
npm run cf:push -- mailto:실제운영자이메일
```

두 번째 명령은 VAPID 키를 비공개로 생성·등록하며 이미 설정된 키 쌍을 유지합니다. PWA의 **설정 → 알림 연결하기 → 테스트 알림**으로 실제 수신을 확인하세요. Android와 iPhone 모두 HTTPS·지원 OS·설치·사용자 권한 조건을 충족해야 합니다. iPhone은 지원 OS에서 Safari의 홈 화면 추가 후 웹앱을 열어 연결합니다.

자동 알림은 **실시간 버스 도착 예측 기준 30·15·5분**입니다. 목표 탑승 시각은 사용자 계획이며 실제 예측 시각과 다릅니다. 집에서 나갈 시각은 예측 도착−도보 시간−여유시간(기본 1분)으로 표시합니다. API가 해당 단계의 예측을 제공하지 않거나 늦게 설정한 단계는 미발송으로 남기며, 설정 시각 알림으로 대체하지 않습니다. OS·절전·네트워크에 따른 지연과 누락이 가능하며 정확한 수신 시각을 보장하지 않습니다.

## 구현 범위

- 정류장 검색·주변 검색, 정류장별 버스·방향 선택.
- 목표 탑승 시각·요일·도보·여유시간, 경로 최대 10개 저장·수정·삭제.
- 익명 기기 쿠키와 D1 소유자 검증, CSRF 검사·요청 제한, 전체 데이터 삭제.
- 목표에 가까운 첫째/둘째 도착 차량 선택·고정, 원본 갱신 시각·출발 예상·단계 이력 표시.
- 경로·서울 탑승일·단계별 원자적 claim, 중복 Cron 방지, 명시적 거절 재시도·구독 만료 처리.
- 반응형 화면, 모바일 하단 탐색·터치 영역, 설치용 아이콘, 오프라인 앱 셸·권한 상태 안내.

무료 운영은 사용량과 실제 CPU에 따라 달라집니다. 무료 한도·일정당 API 요청량·Cron 처리 규모는 [운영 문서](docs/cloudflare.md)에 기록했습니다. 사용자 동의 없이 유료 플랜으로 전환하지 않습니다.

## 검증

```sh
npm test
npm run check
npm run cf:dry-run
# npm start로 체험 모드 Workers를 실행한 다른 터미널에서:
npm run test:browser
```

브라우저 테스트는 시스템 Chromium이 있으면 사용합니다. 없으면 `npx playwright install --with-deps chromium`으로 설치하거나 `CHROMIUM_PATH`를 지정하세요. 모바일 390px·PC 1440px의 CRUD·새로고침·빈 결과·레이아웃·오프라인 PWA·알림 권한/구독 상태를 확인합니다.

테스트에는 실제 로컬 workerd/D1 통합, 시계·공급자·전송을 제어하는 일정 테스트, Node와 workerd 양쪽의 RFC 암호화 벡터·독립 서명 검증이 포함됩니다. 실제 API·Cloudflare 배포·휴대폰 수신과는 구분합니다. [현재 검증 상태](docs/cloudflare-verification.md)를 확인하세요.

이전 Node 경로는 `npm run start:node`로 실행합니다. 파일 저장·2단계 알림을 사용하는 기존 회귀 구현이므로 새 운영 배포에는 사용하지 않습니다. 기존 Dockerfile도 해당 Node 경로용입니다.

설계: [서버리스 설계](docs/superpowers/specs/2026-10-27-cloudflare-design.md) · [구현 계획](docs/superpowers/plans/2026-10-27-cloudflare.md)
