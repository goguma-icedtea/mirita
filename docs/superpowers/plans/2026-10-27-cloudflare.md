# Cloudflare 서버리스·PWA 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Cloudflare 연결 후 배포 가능한 서버리스 미리타 PWA.
**Architecture:** Static Assets + Fetch/Scheduled Worker + D1. 기존 암호화·도메인·브랜드 재사용.
**Tech Stack:** Node 24 개발 도구, Wrangler, workerd, SQLite D1, Web Push.
**Spec:** docs/superpowers/specs/2026-10-27-cloudflare-design.md

## Global Constraints
- Asia/Seoul, 30·15·5분, 도보 직접 입력, 여유 기본 1분.
- 무료 한도 우선. 과금 변경 없음. 비밀값 출력/커밋 금지.
- 사용자 기존 파일 보존. 기존 격리된 클라우드 체크아웃에서 작업.

## Review Focus
- 동시 경로 생성 10개 제한과 기기 격리: 실제 SQLite 병렬 API 테스트.
- 중복 Cron과 전송 중 수정/삭제: 원자 claim 및 revision 테스트.
- 자정/요일/늦은 설정/예측 변경: 고정 시계 도메인 테스트.
- 오래된 API 정보/차량 교체: 공급자 fixture 테스트.
- 권한 철회/오프라인/PWA: 브라우저 검증과 별도 실기기 보류 기록.

### Task 1: D1 API와 배포 기반
Files: worker/index.js, worker/repository.js, migrations/0001_initial.sql, wrangler.jsonc, test/worker.test.js, package.json
Interfaces: repository methods accept device hash; fetch(Request,env) uses env.DB and env.ASSETS.
- [x] 실패 테스트: 실제 로컬 D1에서 CRUD·기기 격리·CSRF·10개 제한·삭제 cascade·서버 재시작 유지.
- [x] Wrangler 설치와 SQL/API 구현, 기존 테스트+새 통합 테스트 통과.
- [x] deploy dry-run과 로컬 서버 기능 요청.

### Task 2: 도착 건과 3단계 스케줄러
Files: server/transit.js, worker/schedule.js, worker/scheduler.js, test/cloud-schedule.test.js, test/cloud-transit.test.js
Interfaces: candidates {vehicleId,seconds,arrivalAt}; schedule decision 순수 함수; scheduled(controller,env) D1 claim 기반.
- [x] 실패 테스트: 목표 차량 선택, 예측 변경, 30/15/5, 과거 단계 미발송, 차량 교체, 자정·요일, 오래된 응답.
- [x] 최소 구현 후 테스트 통과, workerd scheduled 통합에서 push 암호화 실행.
- [x] 동시 실행·revision·HTTP 오류·불명확 전송·구독 만료 테스트.

### Task 3: 모바일 PWA와 배포 인수인계
Files: public/app.js, public/app.html, public/styles.css, public/manifest.webmanifest, scripts/cloudflare-setup.mjs, README.md, docs/cloudflare.md
Interfaces: 기존 API 유지, 추가 arrival/status 필드는 UI에서 구분 표시.
- [x] 브라우저 실패 검증: 요청 활성과 구독 성공 분리, 도착/목표/갱신 시각, 오프라인 상태.
- [x] UI 보완, 모바일/PC CRUD·레이아웃·PWA·JS 오류 통과.
- [x] 계정 접근 확인; 가능 시 원격 연결·배포·HTTPS 확인, 불가 시 정확한 절차와 보류 상태 기록.
- [x] 전체 테스트·dry-run·독립 리뷰 후 완료 상태 문서 작성.

외부 보류: 실제 Cloudflare 연결·배포, 실제 서울 API와 휴대폰 수신은 인증정보·기기 접근 필요. 코드/로컬 검증 완료와 구분하며 docs/cloudflare-verification.md를 따른다.
