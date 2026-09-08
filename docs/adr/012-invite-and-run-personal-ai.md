# ADR 012: 대화 중 개인 AI 초대와 PC 실행기

## Status

Accepted for local MVP (2026-09-08). 감독의 “대화하다 필요하면 버튼 하나로 AI 초대”와
구현 계속 지시에 따른다. 서버 API 키·별도 과금 설정 없이 진행하기 위해 PC의 기존
CLI 로그인을 사용하는 안으로 구현했다. 실행 위치에 대한 감독의 별도 선택 답변은 없었으며
서버 상시 실행·사용량 예산은 후속 결정이다. 운영 배포 전이다.

ADR 011의 **신규 등록 기본 범위**를 변경하고 요청 시 AI 실행을 추가한다.
기존 CHANNELS/ALL·방 전용 MCP 키의 접근 범위는 유지한다.

## Decision

### 초대와 권한

- 개인 AI의 새 기본 범위는 SELECTED(초대한 방만)이다. AgentConversationGrant의
  `(agentId, conversationId)` 복합 키로 초대를 표현한다. 사람의 DM 멤버십에 AI를 넣지 않는다.
- 기존 CHANNELS/ALL과 AgentConversationExclusion은 그대로 적용한다. SELECTED도 제외가 우선한다.
  범위 변경으로 과거 제외를 지우지 않는다. 방에서 내보내면 grant도 제거한다.
- User.defaultAgentId로 기본 AI를 선택한다. 첫 개인 AI를 기본으로 지정하고 회수 시 해제한다.
  기본 AI가 있으면 **AI 초대** 버튼 한 번이 해당 방의 PUT 요청으로 이어진다.
- 등록·기본 선택·초대·내보내기는 소유자만 가능하다. 다른 사람은 참여 상태를 확인하고
  **이미 초대된 AI에 요청**할 수 있다. 최초 연결 화면에 연결한 PC의 AI 사용량을 사용함을 알린다.
- 유효 키·소유자 허용목록·현재 사람 멤버십·scope/grant/exclusion의 공통 관계 조건을
  MCP와 실행기에서 사용한다. 새 연결은 초대 전 어떤 방도 읽지 못한다.
- 초대/내보내기의 실제 상태 변경만 시스템 메시지로 저장·전파한다. 중복 초대는 공지 한 개다.
  시스템 메시지는 일반 사용자가 본문을 수정·삭제할 수 없다.

### PC 실행기와 UI

- `packages/agent-runner`가 Socket.IO `/agent-runner`에 개인 키와 제공자로 인증한다.
  별도 공개 포트가 필요 없다. 하나의 AI에는 실행기 하나만 연결한다.
- 데스크톱의 **이 PC에서 연결**은 Codex/Claude CLI의 로그인 상태를 확인하고 실행기에 연결한다.
  서버가 반환한 ownerId/agentId와 현재 Deuce 로그인 사용자가 모두 같아야 연결을 유지한다.
- 키는 Electron safeStorage로 암호화한 뒤 userData에 저장한다. 평문 저장 대체 경로가 없으며
  Linux의 basic_text도 거부한다. 저장 불가 시 현재 세션만 유지한다. 로그아웃·계정 변경·앱 종료는
  실행기를 중단하고, 재시작 시 같은 원점·같은 사용자 기록만 복구한다.
- 웹만 쓰는 사용자는 연결 JSON을 저장하고 저장소에서 CLI 실행기를 시작할 수 있다.
  기존 MCP 설정 복사/등록은 접을 수 있는 별도 안내로 계속 제공한다.
- `lastConnectedAt`는 실제 키 인증 이력이며 READY와 다르다. 실행기 소켓이 연결되어야 READY,
  요청 중에는 BUSY, 연결이 없으면 OFFLINE이다. CLI 로그인 점검이 향후 모든 모델 호출의 성공을 보장하지는 않는다.
- 방의 `@AI 이름` 멘션 또는 **AI에게 요청**만 실행을 시작한다. AI 게시물은 다른 AI 실행을
  유발하지 않는다. 사람과 AI의 이름이 겹치면 멘션 목록에서 AI를 식별자로 구별한다.
- 초대/설정 모달은 Composer를 재마운트하지 않아 작성 중인 글·첨부를 유지한다.
  모바일에는 목록/대화 전환과 뒤로 가기를 추가한다. 다른 방 이동 후 초안 복구는 별도 미구현이다.

### 실행과 실패 계약

- AgentRun은 요청/질문/결과 메시지 ID와 RUNNING/COMPLETED/FAILED를 저장하는 실행 기록이다.
  PostgreSQL의 `WHERE status = 'RUNNING'` 부분 고유 인덱스로 AI당 동시 실행을 하나로 제한한다.
  대기열·자동 모델 재시도·장애 시 자동 재실행은 없다. Socket.IO는 전송을 담당한다.
- 요청 버튼의 클라이언트 UUID와 AI 멘션 메시지의 clientMessageId를 재전송에도 유지한다.
  같은 ID·같은 요청은 기존 기록을 반환한다. 다른 내용으로 ID를 재사용하면 409다.
  질문 메시지와 실행 기록은 한 트랜잭션에서 생성된다.
- 실행 직전과 응답 저장 직전에 권한을 다시 검사한다. 완료·방별 변경·범위 변경은 같은
  AgentConnection 행 잠금을 사용한다. 완료 트랜잭션은 소유자/요청자의 해당 멤버십 행도
  KEY SHARE로 잠가 탈퇴와 게시의 순서를 정한다. 해제된 권한으로 뒤늦게 게시하지 않는다.
- 내보내기·범위 변경·키 회수는 진행 중 요청을 실패 처리하고 취소 신호를 보낸다.
  이미 AI 제공자에게 전달된 자료를 되돌리거나 이미 쓴 사용량을 취소하는 기능은 아니다.
- Node `events.on`과 AbortSignal로 결과를 기다린다. CLI 제한 150초, 서버 실행 기록 제한 180초다.
  연결 해제/오류/시간 초과 시 실패 기록과 안내를 남긴다. 재시작 후 남은 만료 요청은 다음 상태
  조회나 해당 AI의 새 요청에서 실패로 정리하며 자동 실행하지 않는다.
- 로그는 `agent.runner.connected`, `agent.run.dispatched/completed/failed/persistence_failed`에
  agentId/runId/conversationId/messageId·오류 코드·완료 시간을 기록한다. 키·CLI 원문 출력·대화 본문을
  진단 로그에 넣지 않는다. 실행 기록의 prompt는 채팅 데이터이며 로그가 아니다.

### 모델에 전달하는 자료

- 해당 방의 최근 메시지 50개(삭제·시스템 공지 제외)와 텍스트 첨부만 제공한다.
  첨부는 text/*·개별 32,000바이트 이하·합계 128,000바이트 이하이며 누락/바이너리는 미제공으로 표시한다.
- 임시 빈 작업 폴더에서 CLI 비대화형 모드를 실행하고 끝나면 제거한다. Codex는 사용자 설정을
  로드하지 않고 read-only sandbox·shell/hooks/plugins/multi_agent 비활성화를 적용한다.
  Claude는 safe-mode·빈 tools·strict-mcp-config·dontAsk를 사용한다. 범용 명령 실행기를 노출하지 않는다.
- CLI의 정상 최종 결과만 길이를 검증해 원래 질문을 인용하는 AI 메시지로 저장한다.
  도중 출력/실패 이벤트를 최종 답변으로 게시하지 않는다.
- 영상통화, 이미지/PDF 해석, OCR·색인, 인터넷 조사, 자동 감시, PC 로컬 파일 탐색은 이 실행기의 범위가 아니다.
  기존 MCP의 읽기·검색·첨부/이미지 도구는 외부 AI 세션에서 계속 사용할 수 있다.

## Migration / deployment

Enum에 SELECTED를 추가하는 migration과 기본값 사용 migration을 분리한다. 기존 연결 데이터,
키 해시, 메시지, 제외와 멤버십은 변경하지 않는다. 이후 migration에서 실행 기록/시스템 공지를 추가한다.
배포 순서는 DB 백업·migration·서버/웹 반영 후 새 데스크톱 패키지다. 기존 0.1.2에는 native
connectAgent API가 없어 새 빌드가 필요하다. 실제 서명 앱의 키 저장·업데이트 후 복구는 릴리스 때 검증한다.

실행기 상태는 서버 프로세스 메모리에 있으므로 이 MVP는 기존 단일 서버 프로세스를 전제로 한다.
여러 서버에 분산하는 단계에서는 연결 소유권·라우팅을 별도로 결정해야 한다.

## 근거와 검증

현재 의존성 Prisma·Socket.IO·TanStack Query와 Node 표준 API로 구현했다.
Prisma는 거래/관계 조건, PostgreSQL은 잠금/중복 배제, Socket.IO는 연결, TanStack Query는
요청/조회 상태를 담당한다. 별도 큐·수제 재시도 상태 머신은 추가하지 않았다.

- [Codex 비대화형 실행](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Claude Code programmatic 실행](https://code.claude.com/docs/en/headless)
- [Socket.IO 이벤트](https://socket.io/docs/v4/emitting-events/)
- [Node events.on과 취소](https://nodejs.org/api/events.html#eventsonemitter-eventname-options)
- [PostgreSQL 행 잠금](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)

실제 모델/브라우저/회귀 결과는 [구현 이관](../handoff/2026-09-08-ai-invite-implementation.md)에 기록한다.
