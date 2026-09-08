# 개인 에이전트 참여 범위·이미지 붙여넣기

## 완료된 작업

이슈 #8의 로컬 구현과 회귀·브라우저 검증을 마쳤다. 결정은 ADR 011,
사용법은 `docs/ai-connections.md`, 상세 증빙은 이슈 문서에 있다.
기존 미커밋 작업을 유지한 `feat/8-agent-participation-image-paste` 브랜치다.
기존 4개 migration을 적용한 별도 DB에 채널 키·메시지를 넣고 신규 migration을 적용해
기존 키 해시·방·멤버십·메시지가 보존되는 것도 확인했다.

## 운영 반영에 필요한 단계

1. 감독의 운영 배포 승인 후 기존 VM 배포 절차로 현재 서버·웹·MCP 코드를 묶는다.
2. 기존 운영 백업을 확인한 뒤 `prisma migrate deploy`로 `20260908030000_agent_participation`을 적용한다.
3. 앱의 설정과 1:1 AI 연결 표시, 기존 채널 키의 원래 방 접근을 확인한다.
4. 감독 계정에서 개인 에이전트를 등록해 원하는 참여 범위를 선택하고 연결 설정을 저장한다.
5. 개인 MCP에서 실제 Seo 대화를 찾아 질문에 인용 답장하고 저장된 메시지를 확인한다.

기존 연결 키는 자동으로 범위를 넓히지 않는다. 개인 연결은 새 등록이 필요하며,
이후 새 방마다 재등록하지 않는다. MCP 도구가 갱신되려면 클라이언트에서 연결을 새로 읽어야 할 수 있다.
새 AI UI는 서버·웹 반영으로 제공한다. 이미지 미리보기는 Electron CSP에 `blob:` 허용이 필요하므로 데스크톱 업데이트도 함께 준비한다. 실제 Chromium CSP 검사에서 수정 전 미리보기 실패, 수정 후 이미지 로딩을 확인했다.

## 검증 재실행

`pnpm test`, `pnpm typecheck`, `pnpm build`를 실행한다. 서버 테스트는 로컬 `deuce_test`를 비운다.
브라우저 하네스는 별도 `deuce_issue8_browser_test` DB가 필요하다.

```sh
docker exec server-foundation-postgres-1 createdb -U deuce deuce_issue8_browser_test
DATABASE_URL=postgresql://deuce:deuce@localhost:5434/deuce_issue8_browser_test pnpm --filter @deuce/server exec prisma migrate deploy
DEUCE_PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright node --import ./apps/server/node_modules/tsx/dist/loader.mjs scripts/agent-participation-browser.mjs
```

브라우저 하네스는 자신이 사용하는 고정된 격리 DB만 비우며, Google 응답을 모의한다.
두 계정과 실제 브라우저·Socket.IO·HTTP MCP·파일 저장을 함께 사용한다. OS 클립보드의
브라우저가 읽을 수 있는 기존 내용을 보관하고 검증 후 복원하며 그 내용을 로그로 남기지 않는다.
증빙은 `/tmp/deuce-agent-participation/browser`에 저장한다.

## 남은 검증

운영 반영·실계정 흐름과 Windows 실제 클립보드 단축키는 미실행이다.
연결 해제는 완료 뒤 시작한 요청을 막으며, 이미 진행 중인 요청을 취소하지는 않는다.
