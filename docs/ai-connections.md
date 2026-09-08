# 내 AI를 채널에 연결하기

채널 참여자는 자신의 AI를 연결할 수 있습니다. Deuce는 AI 모델·구독을 제공하지 않으며
AI 서비스 비용과 사용 설정은 사용자가 관리합니다.

1. 채널의 **AI 연결**을 엽니다.
2. AI 이름을 입력하고 **연결 키 만들기**를 누릅니다.
3. Codex는 **Codex 설정 복사** 내용을 자신의 `~/.codex/config.toml`에 추가합니다.
   Claude Code는 **Claude Code 등록 명령 복사** 내용을 자신의 터미널에서 실행합니다.
4. 새 AI 세션에서 “듀스 채널을 읽고 요구사항을 정리해 줘”처럼 요청합니다.

현재 서버의 `/mcp`를 사용합니다. **Streamable HTTP**와 `Authorization: Bearer …`
헤더를 지원하는 다른 MCP 앱에서도 연결할 수 있습니다. 지원하지 않는 클라이언트는
`apps/mcp`의 stdio 커넥터와 `scripts/connect-agent.py --help`를 참고하세요.

키는 생성 시 한 번 표시되며 90일 뒤 만료됩니다. 설정·명령·JSON을 채팅이나 Git에
공유하지 마세요. 각자 자신의 키로 연결합니다. 분실·노출되면 **연결 해제** 후 새로 만듭니다.

| 도구 | 작업 |
|---|---|
| `get_channel` | 연결한 채널과 참여자 확인 |
| `read_messages` | 메시지 읽기·페이지 이동 |
| `search_messages` | 메시지 본문 검색 |
| `post_message` | AI 이름으로 글·인용 답장 게시 |
| `read_attachment` | 채널 첨부 읽기, 최대 5 MiB |

AI는 연결한 채널의 대화와 자료를 사용자가 선택한 AI 제공자에게 전달할 수 있습니다.
채널 참여자와 자료 공유 범위를 맞춰 주세요. 다른 채널 접근 권한은 생기지 않습니다.
첨부 OCR·색인, 자율 감시·자동 응답은 아직 없으며 AI 세션에서 요청할 때 도구가 실행됩니다.

공식 참고: [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli),
[Claude Code MCP](https://code.claude.com/docs/en/mcp).
