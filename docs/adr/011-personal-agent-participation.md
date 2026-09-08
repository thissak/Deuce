# ADR 011: 개인 에이전트의 대화 참여 범위

## Status

Accepted (2026-09-08 감독 승인, #8). 로컬 구현·검증이며 운영 적용 전이다.
ADR 007의 신규 등록 모델·연결 관리 권한과 ADR 008의 도구 목록을 확장한다.

## Context

채널마다 AI 키를 발급하면 기존 연결에서 다른 방을 찾을 수 없다. 일반 대화에는
AI 연결 버튼도 없어 상대방 질문을 읽고 답하지 못했다. 감독은 개인 AI를 한 번 등록하고
`채널만 참여` 또는 `모든 대화 참여`를 선택하며 방별로 제외할 수 있는 흐름을 승인했다.

## Decision

- 신규 개인 AgentConnection은 conversationId가 null이며 scope는 CHANNELS 또는 ALL이다.
  CHANNELS가 등록 기본값이고 ALL은 1:1·그룹·채널을 포함한다.
- 유효 키·소유자 허용목록·소유자의 현재 사람 멤버십·참여 범위·방별 제외를 매 요청 검사한다.
  목록·읽기·검색·게시·첨부는 같은 Prisma 관계 조건을 공유한다. API 권한을 캐시하지 않는다.
- AgentConversationExclusion의 복합 키로 방별 제외를 저장한다. 범위 변경·탈퇴 후 재가입에도
  제외는 남는다. 제외 해제는 전역 범위 안에서 참여를 복구하며 CHANNELS의 DM 접근을 허용하지 않는다.
- 기존 방과 새로 참여한 방은 현재 사람 멤버십에서 접근권한을 계산한다. 개인 AI를
  ConversationMember에 삽입하지 않아 DM의 사람 2명·상대방 이름·읽음 계약을 유지한다.
  참여 AI와 소유자는 방의 AI 연결 화면과 MCP get_conversation에서 확인한다.
- 개인 설정과 방별 제외·기존 키 회수는 해당 AI의 소유자만 변경한다. 다른 참여자는
  현재 참여 중인 AI를 조회할 수 있다. 각 방 상단의 AI 연결은 모든 대화 유형에서 표시한다.
- 기존 conversationId가 있는 키는 방 한정 권한과 AI 멤버십 검사를 유지한다. 마이그레이션이나
  scope 변경으로 개인 키가 되지 않으며 다른 방에 쓰려면 개인 에이전트를 새로 등록한다.
- 공식 MCP SDK와 기존 stdio/Streamable HTTP를 재사용한다. list_conversations와
  get_conversation을 추가하고 기존 get_channel의 인자 없는 호출을 유지한다. 개인 키는
  읽기·검색·게시·첨부에 conversationId를 명시해야 한다. 기본 방을 추측하지 않는다.
- 키의 난수·해시 저장·90일 만료·회수, 자동 쓰기 재시도 금지 계약은 유지한다.
  해제 완료 이후 시작하는 요청은 차단한다. 이미 진행 중인 응답의 취소는 지원하지 않는다.
- 설정·범위·해제 변경은 기존 Socket.IO conversation.updated로 알리고 TanStack Query가
  관련 목록을 다시 읽는다. AI 모델 실행·감시·자동 응답 상태를 의미하지 않는다.

## Consequences

새 방마다 MCP 설정이나 AI 멤버십 복제를 수행할 필요가 없다. ALL 범위를 고르면 소유자가
참여한 기존 대화 이력까지 접근할 수 있으므로 UI에 적용 범위를 명시한다. 방별 제외가
남기 때문에 범위를 재선택해도 사용자가 해제한 방에 자동 재참여하지 않는다.

이미지 붙여넣기는 별도 업로드 상태를 만들지 않는다. ClipboardEvent.files의 첫 지원
이미지를 기존 Composer 초안에 넣고, 미리보기 Object URL과 outgoing mutation의 File
소유권을 분리한다(ADR 004). 기본 paste를 막지 않아 이미지와 함께 복사한 일반 텍스트를
보존하며 기존 25MiB/메시지당 파일 1개 제한과 실패 재전송 계약을 유지한다.

## 근거와 검증

[OWASP 매 요청 권한 검사](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html),
[OpenFGA 관계 기반 접근권한](https://openfga.dev/docs/modeling/parent-child),
[MCP Tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools),
[Clipboard paste](https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event)를 참고했다.
Prisma·MCP SDK·TanStack Query로 필요한 동작을 표현할 수 있어 새 권한 라이브러리나 큐를 추가하지 않았다.

재현·회귀·브라우저 검증은 [이슈 #8 문서](../issues/8-agent-participation-image-paste.md)에 기록한다.
