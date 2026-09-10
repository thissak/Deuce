# ADR 007: 초대형 채널과 외부 AI의 MCP 접속 MVP

2026-09-11: AI 부분은 [ADR 013](013-retire-ai-and-replan.md)으로 대체했다. 사람 채널 기능은 유지하며 제거 변경은 미배포다.

- 상태: Accepted (2026-09-07 감독 지시: 요구사항 채널 생성 + 내 AI 접속)
- 후속: 원격 HTTP 접속과 사용자 설정 복사는 ADR 008에서 추가했다. 아래는 최초 stdio MVP 결정이다.
- 후속: 개인 에이전트 참여 범위·모든 대화 지원·소유자만 연결 관리하는 변경은 ADR 011에서 결정했다. 기존 방 전용 키는 유지한다.

## 범위

Teams·Slack을 참고하는 채팅 중심 제품이다. 영상통화는 제외한다. 첫 실제 사용은
`듀스 요구사항` 채널에서 사람들과 외부 AI가 요구사항을 읽고 의견을 게시하는 것이다.
Codex·Claude Code 양쪽에서 사용할 수 있는 공통 연결을 제공한다.

## 결정과 BP 확인

- 기존 ConversationType.CHANNEL 예약값을 사용한다. 초대된 구성원만 접근하며 팀/조직
  계층·공개 채널 탐색·스레드는 포함하지 않는다. 댓글은 기존 인용 답장을 사용한다.
- `AgentConnection`은 소유한 인간 사용자, 단일 채널, 전용 AI User 신원을 연결한다.
  Node crypto의 256bit 난수 토큰을 생성하고 SHA-256만 DB에 저장한다. 원문은 발급 시
  한 번 응답하며 90일 만료·명시적 회수를 지원한다. AI 신원은 사람 로그인·사용자 검색에서 제외한다.
- 매 API 요청마다 토큰 회수/만료, 소유자의 현재 허용목록, 소유자와 AI의 채널 멤버십을
  검사한다. 채널 구성원은 연결을 회수할 수 있다(기존 그룹 관리와 같은 협업 권한 모델).
  회수 전에 이미 인증된 진행 중 요청까지 취소하는 기능은 없다.
- Prisma migration·transaction으로 신원/멤버십/키 생성을 원자적으로 처리한다.
  별도 캐시·인증 서버·큐·자체 MCP 프로토콜 구현은 만들지 않는다.
- 공식 TypeScript MCP SDK 1.30.0의 stdio transport를 사용한다. SDK v2는 별도 패키지로
  출시됐으나 v1은 유지보수 중이며 현재 MVP에 필요한 도구/stdio 기능을 제공한다.
- 로컬 MCP 커넥터 → HTTPS 듀스의 채널 전용 API. SDK가 JSON-RPC/초기화/도구 스키마를
  처리한다. 인터넷에 HTTP MCP/OAuth 서버를 노출하는 방식은 이번 범위에서 제외한다.
- 도구: get_channel, read_messages, search_messages, post_message, read_attachment.
  전체 대화는 커서로 페이지를 탐색한다. 검색은 메시지 본문만, 첨부는 최대 5MiB를 읽는다.
  텍스트/이미지를 반환하고 다른 형식은 binary resource로 반환한다. PDF·문서 이해는
  AI 클라이언트 기능에 달려 있으며 OCR/문서 인덱서는 없다.
- MCP 서버는 모델을 실행하지 않는다. 사용 중인 Codex/Claude Code가 도구를 호출한다.
  메시지 자동 감시·상시 응답·에이전트 간 자동 대화·모델 과금/작업 큐는 후속 범위다.
- 쓰기는 자동 재시도하지 않는다. 응답을 잃으면 최신 메시지로 저장 여부를 확인한다.
  게시·파일 도구는 채널 ID를 인자로 받지 않아 임의 채널로 접근을 넓히지 못한다.
- 웹 캐시는 기존 react-query, 실시간 게시와 채널 갱신은 기존 Socket.IO 이벤트를 사용한다.
  AI는 사람과 구분되는 AI 배지를 가진다. 토큰/본문을 운영 로그에 추가하지 않는다.

## 검증 기준

사람이 채널을 생성하고 구성원과 의견을 교환할 수 있다. 외부 SDK Client가 실제 stdio로
초기화·도구 목록·채널 읽기·답글·첨부를 호출한다. 다른 채널의 메시지/첨부, 회수/만료 키,
소유자 탈퇴, 인간 세션을 이용한 AI API 접속, AI 키를 이용한 인간 API 접속을 차단한다.
Codex/Claude 설정은 키를 명령 인자에 넣지 않고 권한 0600 파일 경로만 등록한다.

## 공식 근거

- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Codex MCP](https://developers.openai.com/codex/mcp)
- [Claude Code MCP](https://code.claude.com/docs/en/mcp)
