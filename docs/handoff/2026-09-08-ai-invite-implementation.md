# 개인 AI 초대·PC 실행기 구현 이관

## 완료 범위

대화에서 **AI 초대**를 한 번 누르는 흐름을 실제 서버/웹에 구현했다. 최초 연결만 데스크톱의
PC 연결 안내를 거치며 이후 기본 AI를 재사용한다. 초대한 방의 다른 사람도 요청 버튼·멘션으로
질문하고 같은 방에서 AI 신원으로 답변을 받는다. 현재 로컬 코드와 격리 환경의 검증 완료이며
운영 VM·실제 사용자 채널·설치된 앱·릴리스 파일은 변경하지 않았다. 커밋/PR/배포는 하지 않았다.

- 권한: SELECTED + grant/exclusion + 소유자 현재 멤버십. 기존 CHANNELS/ALL/방 전용 키 유지.
- 실행: Socket.IO 전송 + PostgreSQL 실행 기록/동시 실행 제한 + Node 취소 신호.
- PC: Codex/Claude CLI 로그인 재사용, 임시 빈 작업 폴더, 도구 제한·최종 출력 검증.
- 데스크톱: 좁은 preload IPC, 키 암호화 저장·동일 사용자 복구·계정 전환/로그아웃 중단.
- UX: 기본 AI·최초 연결 후 복귀·초대/내보내기 공지·참여/실행 상태·모바일 목록 전환.

결정과 제한은 [ADR 012](../adr/012-invite-and-run-personal-ai.md), 사용자 안내는
[AI 연결](../ai-connections.md)에 있다.

## 검증 결과

2026-09-08 macOS, Node 26.3.1, Codex CLI 0.153.4, Claude Code 2.1.263.
모델 실행에는 설치된 CLI의 실제 로그인과 **테스트용으로 만든 대화/첨부만** 사용했다.

| 검증 | 결과 |
|---|---|
| 전체 자동 테스트 | 261 통과: 서버 93·웹 153·데스크톱 10·실행기 3·MCP 2 |
| 타입/전체 소스 빌드 | `pnpm typecheck`, `pnpm build` 통과 |
| 실제 CLI | 두 제공자 모두 정상 최종 답변 확인 |
| 두 계정 실제 브라우저 | Codex와 Claude 각각 첫 연결→자동 초대→동료 요청→자료 포함 답변→양쪽 표시 통과 |
| 채팅 멘션 | 실제 Composer 후보 선택→전송→두 번째 AI 인용 답변 통과 |
| 초대 재사용/초안 | 내보내기 후 한 번 재초대, 연결 안내 재실행 없음·작성 글 보존·DM 사람 수 2명 유지 |
| 모바일 | Chromium 390×844/360×844에서 초대·채팅·가로 넘침·목록 돌아가기 통과 |
| 기존 MCP/첨부 | CHANNELS→ALL, 동료 읽기 전용 관리, 해제/재참여, MCP 읽기/인용 답장, 이미지 paste·업로드·실패 재전송 통과 |
| 마이그레이션 | 5개 기존 migration DB에 legacy/ALL/CHANNELS fixture 삽입 후 신규 3개 적용, 해시/방/메시지/멤버십/제외 보존 |
| 실패·권한·중복 | 미초대 방 접근 거부, 중복 초대 공지 1개, 같은 요청 1회 실행, 실행 중 해제 후 늦은 답변 차단, 만료 기록 정리 |
| 데스크톱 컨트롤러 | 암호화만 저장·계정별 복구·계정 변경 중단·암호화 불가 시 세션만·로그아웃 중 연결 완료 거부 |

브라우저의 native 연결 버튼은 preload API만 모의하고 그 뒤에는 실제 서버/Socket.IO/CLI를
사용했다. **새 서명 Electron 패키지의 Keychain·업데이트 후 복구 실기 검증을 대체하지 않는다.**
서버 권한/중복/취소 테스트의 모델 응답은 모의 실행기이며, CLI 검증은 별도 브라우저 경로에서 했다.

로컬 스크린샷은 `.private/ai-invite-implementation/`, 기존 회귀는
`/tmp/deuce-agent-participation/browser/`에 있다. Git 공개 파일에 포함하지 않는다.

## 재실행

기본 테스트에는 AI 로그인/운영 계정이 필요 없다.

```bash
pnpm --filter @deuce/server db:migrate:test
pnpm test
pnpm typecheck
pnpm build
```

브라우저 하네스 둘은 **같은 전용 DB를 초기화**하므로 순서대로 실행한다.
DB 이름은 `deuce_issue8_browser_test`로 고정되어 개발/운영 DB를 사용하지 않는다.
Playwright 경로는 로컬에 설치된 패키지 디렉터리로 지정한다.

```bash
DATABASE_URL=postgresql://deuce:deuce@localhost:5434/deuce_issue8_browser_test pnpm --filter @deuce/server exec prisma migrate deploy
DEUCE_PLAYWRIGHT_MODULE=/path/to/playwright pnpm --filter @deuce/server exec tsx ../../scripts/agent-invite-browser.mjs
DEUCE_PLAYWRIGHT_MODULE=/path/to/playwright pnpm --filter @deuce/server exec tsx ../../scripts/agent-participation-browser.mjs
```

실제 모델 검증은 첫 번째 하네스에 `DEUCE_LIVE_AI=codex` 또는 `DEUCE_LIVE_AI=claude`를
추가한다. 각 실행에서 두 번 모델을 호출하며 해당 PC의 AI 사용량이 발생한다.
기존 이미지 paste 하네스는 클립보드를 보존/복구하고 원문을 로그에 출력하지 않는다.

마이그레이션 검증은 지정한 로컬 테스트 PostgreSQL 컨테이너에 임의 이름의 새 DB만 만들고
검증 후 삭제한다.

```bash
python3 scripts/agent-invite-migration-check.py --postgres-container LOCAL_TEST_POSTGRES
```

## 로그로 추적하기

서버의 `agent.run.dispatched` → `agent.run.completed` 또는 `agent.run.failed`를 runId로 묶는다.
완료 로그에는 결과 messageId와 소요 시간, 실패 로그에는 일반 오류 코드가 있다.
질문/결과 연결과 최종 상태는 AgentRun에서 확인한다. 화면 수신/표시 지연은 기존 messageId 기반
[앱 진단 하네스](2026-09-07-diagnostics.md)로 이어서 조사한다. 키나 CLI 원문 출력을 로그에 추가하지 않는다.

## 남은 작업과 배포 순서

1. 현재 변경의 코드 리뷰·PR. 로컬 main의 기존 조사/시안 WIP도 포함되어 있으므로 범위를 함께 검토한다.
2. 운영 DB 백업·신규 migration·서버/웹 배포 후 기존 채팅/MCP 회귀 확인.
3. 새 데스크톱 버전·서명/공증·패키징, 실제 앱 최초 연결/암호화 저장/재실행·업데이트 후 복구 확인.
   기존 0.1.2에는 native connectAgent API가 없다.
4. Windows/Intel Mac CLI 및 패키지에서 별도 실기 검증. 브라우저 반응형 검증은 iOS/Android 실기를 의미하지 않는다.
5. 다른 사용자 3~5명에게 최초 CLI 설치/로그인·AI 연결·한 번 초대 과제를 수행하게 하고 어려운 지점을 조사.

현재 자동 답변은 최근 메시지 50개와 작은 text/* 첨부만 읽는다. 이미지/PDF 해석·인터넷 조사·
상시 서버 실행·사용량 예산·자동 감시·방 이동 후 초안 복구는 미구현이다. 서버 실행기 연결 상태는
단일 프로세스 메모리에 있으므로 여러 서버로 확장할 때는 라우팅/연결 소유권 설계가 필요하다.
