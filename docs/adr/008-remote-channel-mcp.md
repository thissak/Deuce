# ADR 008: 다른 사용자를 위한 원격 채널 MCP

## Status

Accepted (2026-09-07 감독 지시: 다른 사용자도 연결할 수 있게 수정)

후속 개인 연결과 대화 선택 도구 확장은 ADR 011을 따른다. 아래는 최초 원격 연결 결정이다.

## Context

ADR 007의 stdio 커넥터는 사용자마다 저장소·Node.js·빌드가 필요했다. 일반 사용자가
자신의 Codex·Claude Code에서 채널에 접속하도록 서버 주소 기반 연결을 추가한다.

## Decision

- 기존 Fastify에 `/mcp` Streamable HTTP를 추가한다. 공식 SDK 1.30.0이 프로토콜을
  처리하며 JSON 응답·요청별 독립 인스턴스를 사용한다. GET/DELETE는 405, 알림은 202다.
- stdio와 HTTP가 같은 다섯 도구를 사용한다. HTTP는 서버 내부의 고정 `/api/agent` 경로를
  호출하여 권한·첨부 제한·Socket.IO 게시 계약을 재사용한다. 외부 URL이나 Host 헤더를
  대상으로 fetch하지 않는다. 내부 호출과 외부 요청은 같은 진단 trace ID를 사용한다.
- 초기화·도구 목록을 포함한 모든 HTTP 요청에서 기존 채널 키와 소유자·AI 멤버십을
  검사한다. 도구 실행 시 API가 다시 검사한다. 쿠키·쿼리 문자열 인증은 지원하지 않는다.
- Origin이 있으면 설정된 Google callback의 origin과 정확히 일치해야 한다. 헤더가 없는
  네이티브 클라이언트는 허용한다. 공개 브라우저 CORS는 열지 않는다.
- 연결별 분당 120 MCP 요청, 요청 본문 64KiB, 기존 API 도구 요청 제한을 적용한다.
  토큰·도구 인자·본문을 로그에 남기지 않는다. 세션 캐시나 자동 재시도는 없다.
- 웹 AI 연결 화면에 공개 주소, 한 번 발급한 키를 포함한 Codex TOML 설정 복사와
  Claude Code 사용자 범위 등록 명령 복사를 제공한다. Codex는 기존 config.toml에
  추가하고 Claude Code는 터미널 명령으로 등록한다. 등록명은 연결 UUID로 구분한다.

## Consequences

- 사용자는 듀스 소스나 별도 MCP 실행 프로그램을 설치하지 않는다. 기존 stdio 키도
  그대로 원격 HTTP에서 사용할 수 있으며 기존 로컬 연결은 유지된다. DB 변경은 없다.
- 이 버전은 수동 Bearer 키 연결이다. OAuth 로그인형 커넥터만 허용하는 제품과는
  호환을 보장하지 않는다. Claude Code와 Claude 웹/데스크톱의 연결 기능은 구분한다.
- 키 포함 설정은 개인 설정에만 저장한다. Claude 등록 명령은 사용자의 터미널 이력과
  등록 순간 프로세스 인자에 남을 수 있다. 키 분실·노출 시 웹에서 해제하고 재발급한다.
- AI 상시 실행·새 메시지 감시·자동 응답은 추가하지 않는다. 회수 시 이미 실행 중인
  요청을 취소하는 기능도 기존과 같이 없다.

## 검증

실제 HTTP SDK Client 두 개와 서로 다른 소유자·채널로 초기화·읽기·검색·게시·격리를
검증한다. 회수·소유자 탈퇴·만료·Origin·쿠키/쿼리 키·프로토콜·요청 크기·속도 제한을
검증한다. 기존 stdio 및 웹 키 비노출/설정 복사 검증도 유지한다.

## 공식 근거

- [MCP HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Codex HTTP MCP 설정](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Claude Code HTTP 및 add-json](https://code.claude.com/docs/en/mcp)
