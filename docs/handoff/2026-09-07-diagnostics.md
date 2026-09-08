# 앱 전체 진단 사용법

## 사용자 재현

1. 배포 후 새로고침하고 왼쪽 `진단`을 누른다. 로그인 전부터 필요하면
   `https://deuce.goldenlabs.dev/chat?diagnostics=1`로 접속한다.
2. 검색·채팅·첨부·활동 이동 등 문제가 생기는 동작을 반복한다. 오른쪽 위 패널은 접을 수 있다.
3. `서버로 보내기`를 누르고 표시되는 접수번호를 전달한다. 연결이 끊겼으면
   `파일로 저장`으로 JSON을 보관한다. 로그인하지 않으면 서버 전송은 401로 거절된다.
4. `끄기`로 관측을 종료한다. 활성화 플래그만 sessionStorage에 남으며 기록은 메모리에만
   있어 새로고침하면 초기화된다. 버퍼는 최근 500건이며 오래 관측하면 앞부분을 잃을 수 있다.

본문·검색어·파일명·인증 원문은 기록하지 않는다. 사용자/메시지/요청 ID가 있으므로
진단 파일은 담당자에게만 전달한다. 서버 전송은 누를 때만 발생한다.

## 분석

프로젝트 루트에서 실행한다. `--vm`은 gcloud IAP 인증이 필요하며 최근 2시간을 읽는다.
원본 journal에는 이전 버전의 URL 로그가 있을 수 있으므로 원문을 대화에 붙이지 않는다.

```bash
python3 scripts/diagnostics-report.py --vm YOUR_VM --project YOUR_GCP_PROJECT --zone YOUR_ZONE --report-id <접수번호>
python3 scripts/diagnostics-report.py --vm YOUR_VM --project YOUR_GCP_PROJECT --zone YOUR_ZONE --client ~/Downloads/deuce-diagnostics.json
python3 scripts/diagnostics-report.py --server /tmp/deuce.jsonl --client /tmp/client.json
```

접수번호를 생략하면 최근 업로드 보고서를 선택한다. `reportComplete=false`는 journal의
이벤트 수가 접수 메타데이터와 다르다는 뜻이다(보존·rate limit·수집 구간 점검).
`dropped`는 브라우저 버퍼에서 사라진 이벤트 수다. 보고서에는 전체 clientTimeline,
경로별 서버 p50/p95/max, trace가 일치하는 서버 요청, 브라우저 HTTP 시간,
전송→소켓/DOM/frame, 서비스 자원 지표·오류 수가 나온다. `serverRequests`는 선택한
브라우저 trace에 해당하며 경로별 집계와 서비스 지표는 수집 구간 전체다.

- HTTP가 느리고 app/db가 짧으면 브라우저 대기·네트워크·터널 구간을 추가 조사한다.
  두 수치의 차이를 순수 네트워크 시간이라고 단정하지 않는다.
- app/db가 길면 같은 trace의 journal `queries`에서 모델·작업·시간을 확인한다.
- 응답 후 DOM까지 길면 clientTimeline의 캐시 반영·longtask·화면 이동·visibility를 본다.
- 소켓 장애는 연결/재접속/오류 이벤트와 서버 소켓 수·룸 준비 기록을 함께 본다.
- JS 오류는 종류와 줄/열을 남긴다. 오류 원문·브라우저 stack은 저장하지 않는다.
  frame은 실제 paint 보장이 아니며 클라이언트 보고는 서버가 검증한 사실과 구분한다.

## 재사용 가능한 로컬 브라우저 하네스

```bash
pnpm --filter @deuce/web build
python3 scripts/diagnostics-browser-harness.py
```

`http://localhost:5473/chat/00000000-0000-4000-8000-000000000002?diagnostics=1`에 접속한다.
실제 dist를 제공하되 API는 메모리 fixture로 대체한다. 운영 메시지나 DB를 변경하지 않는다.
메시지 POST는 기본 600ms 지연, Server-Timing은 app 10ms/db 4ms다. 브라우저 개발자 도구에서
`window.__diagnosticHarness.delayMs`를 바꿀 수 있으며 서버 전송 결과는
`window.__diagnosticHarness.report`에서 확인한다. Socket.IO는 의도적으로 실패해 재접속
관측을 제공한다. 이 fixture는 실제 서버 소켓 통신·네트워크 성능 검증을 대체하지 않는다.

2026-09-07 검증: 로컬 웹 141개·서버 70개, 타입 검사·웹 빌드 통과.
VM의 Node 24·PostgreSQL 17 격리 DB에서도 서버 70개 통과(검증 DB 제거).
실제 Chromium에서 600ms 주입 → HTTP 602.3ms / 전송→DOM 607.8ms, 본문 비포함 확인.
운영 지연의 원인은 실제 재현 보고 수집 후 판정한다. 아키텍처: ADR 006.

## 배포 확인

`20260907-02` 적용 완료. 공개 health/SPA 200·미로그인 auth/진단 401, UUID 추적 헤더와
Server-Timing, 새 JS 자산 확인. IAP 수집기가 실제 요청/소켓 로그를 읽고 60초 주기
서비스 지표도 기록됐다. 리뷰게이트 active/HTTP 200, 배포 후 백업 성공.
복구 아카이브 다운로드 해시·파일 166개 검증 결과는 `2026-09-07-diagnostics-receipt.json` 참조.
운영 클라이언트 진단 보고는 아직 업로드되지 않아 실제 지연 원인 분석은 남아 있다.
