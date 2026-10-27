# 미리타 서버리스 검증 기록

확인일: 2026-10-27 (Asia/Seoul). 대상: 현재 체크아웃의 Cloudflare 전환 코드. 실제 배포 주소는 아직 없다.

| 구분 | 상태 | 근거와 한계 |
| --- | --- | --- |
| 코드 구현 | 구현·로컬 검증 | Workers Fetch API, D1 마이그레이션 2개, Scheduler RPC, 30/15/5단계, PWA, 계정 연결·배포·키 등록 명령 |
| 자동 테스트 | 37개 통과, 실패·건너뜀 0 | `npm test`; 실제 로컬 workerd/D1 통합 포함. 공급자와 푸시 전송은 fixture로 제어 |
| 구문·번들 | 통과 | `npm run check`, `npm run cf:dry-run`; 총 업로드 약 38KiB, gzip 약 11KiB |
| 설치 재현 | 통과 | 고정 package-lock으로 `npm ci`, 로컬 마이그레이션 재실행(no migrations), 전체 테스트·검사·dry-run |
| 모바일·PC 브라우저 | 통과 | 390px·1440px CRUD/새로고침/빈 상태/가로 넘침/JS 오류, 오프라인 앱 셸, 알림 권한 철회·브라우저 구독 없음 |
| 로컬 재시작 | 통과 | 실제 Workers 프로세스 종료·재시작 후 같은 익명 기기의 D1 경로 조회, 검증 데이터 정리 |
| 푸시 암호화 호환성 | 통과 | Node/workerd 양쪽 RFC8291 공식 벡터 일치, 생성 VAPID JWT를 Node 독립 공개키 검증 |
| 실제 서울 API | 보류 | SEOUL_BUS_API_KEY 미설정. 실제 번호 검색·30분 예측 범위·승인별 호출 한도도 확인 필요 |
| Cloudflare 계정 연결·배포 | 보류 | `cf:whoami` 미인증, `cf:connect`는 토큰 없음으로 실패. 계정 ID·토큰은 실행 환경에 아직 없음; 설정 초안의 토큰 binding도 미저장 상태 확인 |
| 무료 운영 CPU·사용량 | 보류 | 공식 한도·요청량 추산은 문서화했으나 production CPU Metrics와 공급자 호출량 실측 없음 |
| Android 실기기 | 보류 | HTTPS 운영 주소·유효 VAPID·휴대폰 권한과 실제 수신 확인 필요 |
| iPhone 실기기 | 보류 | 지원 OS·홈 화면 설치·실제 푸시 수신 확인 필요. 최신 WebKit 본문 접근도 환경에서 차단됨 |

## 독립 리뷰와 수정 근거

독립 리뷰에서 Important 5개를 확인했고 각각 실패 재현 후 수정했다.

1. Cron 지연 뒤 API 응답이 미래로 취급됨 → 실행 시계로 신선도·단계를 계산. `delayed execution uses current clock...` 통과.
2. 수정 전 호출이 이전 차량을 고정함 → 모든 commute 변경에 route revision 조건, 명시적 설정 변경은 차량 고정을 해제하되 그날 단계 이력 유지. `stale route revision cannot bind...` 통과.
3. 늦은 수정·재활성화·구독을 최초 생성일로 판단 → route/subscription 유효 시작 시각 추가. `late reactivation and late subscription...` 통과.
4. 자정 이후 전날 탑승 일정이 사라짐 → 전날·오늘·다음날 창 계산. `yesterday commute remains active...` 통과.
5. 서버 구독·권한만 보고 연결됐다고 표시 → 브라우저 실제 구독과 서버 fingerprint 대조, 시작·focus 때 갱신. `missing browser subscription exposes reconnect` 통과.

추가로 루트 소개 페이지 라우팅, 버스 API 장애 중 알림 비활성화, 초기화 안 된 DB의 health 503, API 응답 지연에 따른 남은 시간 부풀림을 실패 테스트로 확인하고 수정했다.

## 보류한 작은 항목

전송 claim 직후 프로세스가 중단되면 `sending` 상태가 자동으로 `uncertain`으로 바뀌지 않아 화면에 결과 확인 중으로 남을 수 있다. 자동 재발송은 하지 않아 중복을 억제하며, 수신 성공으로 표시하지 않는다. 운영 로그와 이력으로 확인해야 한다. 자동 상태 전환 개선은 후속 항목이다.

## 구현 중 판단과 영향

- 사용자가 서버리스·PWA·Cloudflare를 정하고 코딩 계속을 지시했으므로 추가 설계 질문 대신 구현을 진행했다. 작은 UX 선택이 의도와 다르면 수정이 필요할 수 있다.
- 기존 격리 체크아웃과 PWA·브랜드를 재사용하고 새 worktree나 프런트엔드 프레임워크를 만들지 않았다. 잘못된 선택이면 구조 변경 비용이 생기지만 기존 작업을 보존한다.
- 무료 D1 쿼리 한도와 여러 경로의 분당 관찰을 함께 만족시키도록 경로별 Scheduler RPC를 채택했다. 최대 20개/분이며 실제 CPU·더 큰 규모는 배포 뒤 측정해야 한다.
- 실제 30분 예측·무료 production CPU·Android/iPhone 전달은 자동 테스트로 확정하지 않는다. 이 판단을 생략하면 서비스 신뢰도·비용을 잘못 안내할 수 있으므로 외부 검증을 보류로 남겼다.
- 전송 시작 이후 사용자가 수정·해제하는 경우 이미 진행 중인 푸시를 취소할 수 없다. 전송 직전 revision을 확인해 창을 줄이지만 전달 시스템의 취소 보장은 제공하지 않는다.

## 다음 단계

환경 설정에 `CLOUDFLARE_ACCOUNT_ID`와 비밀값 `CLOUDFLARE_API_TOKEN`을 입력·저장해 런타임에 반영한다. 토큰은 해당 계정의 Workers Scripts/D1 편집 권한이 필요하다. 값이 사용 가능해지면 `npm run cf:connect`, `npm run cf:deploy`와 HTTPS 기능 확인을 이어간다. 서울 API/VAPID 설정과 휴대폰 검증 절차는 [배포·운영 안내](cloudflare.md)에 묶어 두었다.

클라우드 환경의 install_script·start_skill 저장과 Cloudflare 애플리케이션 배포는 별개다. 설정 초안을 저장했다고 앱 배포나 새 작업 복원이 확인된 것은 아니다.
