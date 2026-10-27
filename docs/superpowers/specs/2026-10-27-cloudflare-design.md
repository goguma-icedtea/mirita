# 미리타 서버리스·PWA 설계

2026-10-27. 사용자 결정: 서버리스, PWA, Cloudflare 배포 지원. 최신 지시로 설계 질문 대신 코딩을 계속한다. 기존 유효 코드와 브랜드를 재사용한다.

## 목표와 구조
서울 버스, 익명 기기별 경로, Asia/Seoul 일정, 수동 도보 시간과 여유시간(기본 1분), 모바일 우선 PWA. 광고·계정·동기화·결제는 제외한다.
Cloudflare Workers의 Fetch/Scheduled 진입점, Static Assets, D1 SQLite를 사용한다. 기존 Node 서버는 회귀 검증용으로 남긴다. JSON 파일 저장과 setInterval은 운영 경로에서 사용하지 않는다. Workers nodejs_compat으로 기존 RFC 검증 암호화 코드를 재사용하되 workerd에서도 실제 실행한다.

검토 대안: Node 서버 유지(기존 기능 재사용은 쉽지만 서버리스 요구와 맞지 않음), Workers+D1+Cron(선택: 단일 배포와 SQL 원자성), 별도 프런트/서버리스 공급자 조합(인증·CORS·예약 작업 운영이 복잡해 제외). 프런트엔드 프레임워크 교체는 필요하지 않다.

## 저장·보안·API
D1 devices, routes, subscriptions, commutes, notification_events, rate_limits, transit_cache 테이블. 기기 쿠키는 난수 256비트, HttpOnly/SameSite=Strict/HTTPS Secure. D1에는 쿠키의 SHA-256 해시만 저장한다. 소유자 조건을 모든 조회·변경에 적용하고 JSON 쓰기 Origin 검사·본문 32KB·요청 제한을 유지한다. 데이터 삭제는 FK cascade로 일정·이력·구독까지 제거한다. 경로는 기기당 최대 10개, SQL 원자성으로 제한한다.
기존 /api 계약과 /healthz, /app을 유지한다. /api/config에는 브라우저 공개 VAPID 키만 반환한다. 운영 오류는 비밀값을 노출하지 않는다. 정적 응답에도 CSP 등 보안 헤더를 적용한다.

## 도착 건과 알림
API의 첫째·둘째 도착 건, 차량 ID, 예측 시각과 실제 조회 시각을 정규화한다. 목표 시각은 계획, 도착 시각은 예측으로 별도 표시한다. 목표 ±15분 후보 중 가장 가까운 차량을 선택하고 차량 ID로 고정한다. 유효 차량 ID가 없으면 자동 발송하지 않는다. 선택 차량이 사라져도 새 차량으로 자동 교체하지 않고 정보 없음/놓침으로 표시한다. 도착 예측은 요청 때마다 원본 조회 시각을 유지하여 오래된 캐시를 새 정보로 포장하지 않는다.
도착 30/15/5분 단계, 출발 시각=예측 도착−도보−여유. 출발 안내는 화면에 표시하며 기본 푸시는 총 3회다. 정상 사전 설정에서 각 단계의 도달을 확인하고 90초 허용 창 안에서만 발송한다. 늦은 설정·예측 급변·장애 복구로 지나간 단계는 skipped로 저장하며 발송으로 표시하지 않는다. 실시간 30분 예측이 없으면 30분 알림은 unavailable/skipped로 남기고 목표 시각 알림으로 대체하지 않는다.
일정 키는 route ID+서울 탑승일, 단계 PK는 일정+30/15/5. 같은 날 수정·재활성화로 발송 횟수를 초기화하지 않는다. 경로 설정 revision과 구독 revision을 보내기 전 확인한다. 최초 생성 시각뿐 아니라 최신 설정·재활성화·구독의 유효 시작 시각 이후에 도달한 단계만 발송한다. 명시적 설정 변경은 차량 선택을 다시 하되 해당 서울 탑승일의 단계 이력은 유지한다. Cron 예정 시각 대신 실제 실행 시계를 사용하고 자정 이후에도 전날 탑승일의 관찰 창을 유지한다. D1 원자적 claim 후 발송하며 동시 실행을 막는다. 성공 기록 전 중단/네트워크 응답 불명은 uncertain으로 남기고 자동 재발송하지 않아 중복 위험을 줄인다. 외부 푸시의 중복·수신 시각은 보장할 수 없다. 명시적인 HTTP 거절만 허용 창 내 재시도한다. 404/410은 해당 구독 버전만 삭제한다.
Cron은 UTC 매분, 일정 계산은 서울 기준. 활성 시간은 목표 60분 전~15분 후. next_check 인덱스로 최대 20개를 선택하고 자기 서비스의 Scheduler RPC로 경로별 독립 실행한다. 각 실행은 한 경로만 처리해 D1 쿼리 한도 50을 지킨다. 남은 대상은 다음 분에 순환한다. 기본 소규모 개인용이며 대규모 무제한 발송을 약속하지 않는다. CPU 10ms 제한을 로컬 테스트로 검증했다고 주장하지 않는다.

## PWA·모바일
기존 파랑/네이비 브랜드와 한 화면 경로 설정을 유지한다. 하단 탐색, 44px 터치 영역, safe-area, 큰 도착·출발 정보, 오프라인 표시를 점검한다. 경로 알림 요청과 실제 기기 연결 상태를 분리한다. iOS 홈 화면 설치 안내, 거절/철회/미지원/재구독, 테스트 전송과 실제 수신 구분을 제공한다. API는 캐시하지 않는다. 앱 셸 캐시 갱신 시 오래된 화면 고정 방지를 검증한다.

## 배포와 완료 기준
Wrangler 설정·마이그레이션·비밀값 없는 예시·배포 스크립트·한국어 운영 문서 제공. Cloudflare 계정 인증 후 D1 생성/바인딩, 로컬+원격 마이그레이션, dry-run, deploy, HTTPS 요청 순서. 기존 자원은 삭제하지 않는다. 서울 키/VAPID는 Wrangler secret으로 입력하고 저장소에 기록하지 않는다. 기본 demo 배포에는 실제 알림을 보내지 않는다.
완료 보고를 코드/자동 테스트/실제 API/배포/Android/iPhone으로 나눈다. 계정·API 키·실기기 없이 해당 항목을 성공 처리하지 않는다.

## 근거와 미확인 항목
2026-10-27 Cloudflare 공식 cloudflare-docs production 브랜치의 workers/platform/pricing.mdx, limits.mdx, configuration/cron-triggers.mdx, runtime-apis/nodejs/crypto.mdx 확인: Free 100,000 동적 요청/일, CPU 10ms/실행(Cron 포함), 외부 subrequest 50/실행, Cron UTC, node:crypto 예외 외 지원. https://developers.cloudflare.com/workers/platform/limits/ 및 https://github.com/cloudflare/cloudflare-docs/tree/production/src/content/docs/workers
공식 사이트 직접 접근은 환경 프록시 403이므로 공식 GitHub 원본을 확인했다. 공식 src/content/partials/workers/d1-pricing.mdx 및 d1/platform/limits.mdx 추가 확인: 읽기 500만 행/일, 쓰기 10만 행/일, 총 5GB·DB당 500MB, 실행당 쿼리 50. 실시간 API의 30분 예측 지원, API 승인별 호출 한도, 모바일 실제 수신, 배포 CPU 실측은 미확인. 보장 문구를 사용하지 않는다.
