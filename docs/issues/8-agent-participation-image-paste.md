# #8 에이전트 참여 범위와 클립보드 이미지 붙여넣기

**Issue**: https://github.com/thissak/Deuce/issues/8
**Status**: Resolved candidate (기능별 PR 리뷰·머지 진행, 운영 적용 전)
**Created**: 2026-09-08

## 1. 문제

일반 대화에서 AI 연결 버튼이 없어 상대방 질문을 MCP로 읽거나 답할 수 없다.
채널마다 연결 키와 외부 AI 설정을 반복해야 한다. 입력창은 파일 선택·드롭만 지원한다.

승인된 범위: 에이전트별 `채널만 참여` / `모든 대화 참여`, 기존·새 소유자 참여 방에
자동 적용, 방별 제외 우선, 모든 방에서 참여·해제, 기존 채널 키 호환, 이미지 붙여넣기.
현재 WIP를 보존해 `feat/8-agent-participation-image-paste`에서 작업한다.

## 2. 원인 분석

`agent-participation.test.ts`: POST /api/agents가 404 (기대 201).
`clipboard-image.test.tsx`: paste 후 screenshot.png 이미지 요소를 찾지 못함.
기존 AgentConnection은 conversationId 필수이며 관리 API/화면이 CHANNEL만 허용한다.
Composer에는 onPaste가 없고 파일 선택·드롭만 pickFile을 호출한다.

## 3. Best Practice 조사

기존 Prisma 관계 조회로 소유자 사람 멤버십 ∧ scope ∧ 방별 제외를 요청마다 검사한다.
AI를 사람 멤버 목록에 일괄 삽입하지 않으므로 동기화 큐·캐시·권한 라이브러리는 추가하지 않는다.
기존 conversationId가 있는 키는 계속 해당 방만 접근한다. 신규 개인 키는 목적지를 명시해야 한다.

- [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): 매 요청 권한 검사.
- [OpenFGA 관계 모델](https://openfga.dev/docs/modeling/parent-child): 상위 관계에서 권한을 도출하는 참고 사례.
- [MCP Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools): 입력 스키마 검증·도구 접근 통제.
- [MDN paste](https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event): ClipboardEvent 파일을 기존 첨부 흐름에 연결, 일반 텍스트 기본 동작 보존.
- [TanStack mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations): 기존 outgoing mutation이 실패 payload와 재전송을 계속 소유.

검증할 경계: 타인 설정 변경, 범위 축소·제외·소유자 탈퇴·만료·회수 후 접근, 다른 방의
cursor/인용/첨부, 기존 키 범위 보존, DM 2인 계약, 새 이미지 초안과 실패 payload 분리.

## 4. 수정 내용

| 파일 | 변경 |
|---|---|
| `apps/server/prisma/schema.prisma`, `20260908030000_agent_participation/migration.sql` | nullable 기존 방 관계, scope, 방 제외 복합 키 |
| `apps/server/src/domain/agents.ts` | 토큰 유효성과 공유 대화 접근 조건 |
| `apps/server/src/routes/agent-management.ts` | 개인 등록·범위 변경·전체 회수, 모든 방의 조회·제외·재참여, 소유자 관리 |
| `apps/server/src/routes/agents.ts`, `mcp.ts` | 개인 키의 목적지 검증과 목록·읽기·검색·게시·첨부 |
| `apps/mcp/src/server.ts` | 대화 탐색 도구와 목적지 인자, 인자 없는 기존 get_channel 호환 |
| `packages/shared/src/agent.ts` | 개인 설정·참여 상태 DTO |
| `apps/web/src/components/MyAgentsSettings.tsx`, `AgentConnectionSetup.tsx`, `AgentSettings.tsx` | 최초 등록 설정 복사, 전역 범위 선택, 방별 참여 관리 |
| `Shell.tsx`, `ChatView.tsx`, `realtime/wiring.ts`, `styles.css` | 설정 진입·모든 방 AI 연결·실시간 새로고침 |
| `Composer.tsx` | 이미지 paste→기존 첨부 초안, 업로드 진행 표시·제거 접근성 |

이전에는 채널마다 키와 AI 멤버를 만들었다. 신규 개인 연결은 소유자의 현재 사람
멤버십에서 접근권한을 계산한다. 개인 AI를 DM 사람 멤버에 추가하지 않는다. 제외는
전역 범위보다 우선하며 기존 키는 확대하지 않는다. 키 생성·scope 변경·회수는 소유자만 한다.
이미지 paste는 기존 outgoing mutation과 파일 크기 제한을 그대로 사용한다.

## 5. 검증 결과

| 항목 | 수정 전 | 수정 후 |
|---|---|---|
| 개인 에이전트 등록과 참여 범위 재현 | 404, FAIL | PASS |
| 이미지 paste 후 미리보기·설명 전송 | 이미지 없음, FAIL | PASS |
| 전체 테스트 | 신규 재현 2건 실패 | 웹 149·서버 88·MCP 2·데스크톱 6개 PASS |
| 타입 검사·웹/MCP/데스크톱 빌드 | — | PASS |
| 기존 DB 업그레이드 | 기존 4개 migration과 채널 키·메시지 seed | 신규 migration 적용 후 키 해시·기존 방·기본 scope·사람/AI 멤버십·메시지 보존 PASS |
| 권한 경계 | 채널 한정 | scope 축소·방 제외·타인 관리·만료·회수·소유자 탈퇴·재참여·기존 키·cross-room 인용/커서/첨부 PASS |
| 실제 HTTP/stdio MCP | 단일 채널 | 대화 탐색→질문 읽기→인용 답장→해제 후 차단 PASS |
| Chromium 실제 앱 두 계정 | — | 설정·참여 상태 실시간 표시·키 비노출·Mac 단축키 이미지/혼합 텍스트 paste·업로드·MCP 이미지 읽기·실패 재전송·새 초안 보존 PASS |

브라우저 하네스: `scripts/agent-participation-browser.mjs`. 격리 DB
`deuce_issue8_browser_test`와 모의 Google 로그인으로 실제 앱을 구동한다.
로컬 증빙: `/tmp/deuce-agent-participation/`의 테스트 로그 및 `browser/*.png`.

운영 DB·배포·실제 사용자 대화에는 변경하지 않았다. 운영 앱 적용과 개인 연결 등록 후
실제 Seo 대화에 답하는 단계가 남아 있다. Windows 실제 OS 클립보드 검증은 이 Mac에서 수행하지 않았다.

## PR 분리 검증

웹 실행·진단 #9, 채널 MCP #10, 데스크톱·기여 환경 #11, 개인 AI API #12, 설정 UI·붙여넣기를 분리했다. 리뷰에서 로컬 OAuth 호스트, WebSocket 종료, AI 검색의 리터럴 처리, 데스크톱 blob 이미지 정책을 수정했다. 최종 통합 테스트 245개·타입 검사·빌드와 실제 브라우저/MCP 시나리오를 통과했다.
