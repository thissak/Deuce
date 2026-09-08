# AGENTS.md — Deuce Codex mediator

Claude Code가 관리하는 `CLAUDE.md`와 프로젝트 문서를 SSOT로 유지한다. 이
파일에는 Codex가 그 원본을 찾고 적용하는 규칙만 둔다.

## 작업 진입

1. 글로벌 `~/.claude/CLAUDE.md`가 있으면 끝까지 읽는다.
2. 프로젝트 `CLAUDE.md`를 끝까지 읽는다.
3. `CLAUDE.md`가 지정한 `docs/PROGRESS.md`, 이어서
   `docs/CHANGELOG.md`를 각각 끝까지 읽는다.
4. Git 상태를 확인하고 사용자 WIP를 보존한다.

## SSOT 브릿지

- Claude Code가 관리하는 위 문서가 원본이다. 규칙과 스킬 본문을 이 파일에
  복제하지 않는다.
- 로컬 글로벌 스킬을 사용하는 경우 SSOT는 `~/.claude/skills/`이며,
  `~/.agents/skills/`의 동일 이름 항목은 Codex 발견용
  포인터다.
- 이 저장소의 기여·검증 절차는 `CONTRIBUTING.md`에 있다. 개인 글로벌
  설정이나 스킬 설치는 외부 기여자의 필수 조건이 아니다.

사용자의 최신 지시와 상위 Codex 정책을 우선한다. 문서끼리 충돌하면 더
구체적인 프로젝트 또는 하위 디렉터리 규칙을 우선한다.
