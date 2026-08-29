# AGENTS.md — Deuce Codex mediator

Claude Code가 관리하는 `CLAUDE.md`와 프로젝트 문서를 SSOT로 유지한다. 이
파일에는 Codex가 그 원본을 찾고 적용하는 규칙만 둔다.

## 작업 진입

1. 글로벌 `/Users/showmethemoney/.claude/CLAUDE.md`를 끝까지 읽는다.
2. 프로젝트 `CLAUDE.md`를 끝까지 읽는다.
3. `CLAUDE.md`가 지정한 `docs/PROGRESS.md`, 이어서
   `docs/CHANGELOG.md`를 각각 끝까지 읽는다.
4. Git 상태를 확인하고 사용자 WIP를 보존한다.

## SSOT 브릿지

- Claude Code가 관리하는 위 문서가 원본이다. 규칙과 스킬 본문을 이 파일에
  복제하지 않는다.
- 글로벌 스킬 SSOT는 `/Users/showmethemoney/.claude/skills/`이며,
  `/Users/showmethemoney/.agents/skills/`의 동일 이름 항목은 Codex 발견용
  포인터다.

사용자의 최신 지시와 상위 Codex 정책을 우선한다. 문서끼리 충돌하면 더
구체적인 프로젝트 또는 하위 디렉터리 규칙을 우선한다.
