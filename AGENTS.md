# AGENTS.md — Deuce Codex mediator

Claude Code가 관리하는 `CLAUDE.md`와 프로젝트 문서를 SSOT로 유지한다. 이
파일에는 Codex가 그 원본을 찾고 적용하는 규칙만 둔다.

## 작업 진입

1. 글로벌 `C:\Users\qart\.claude\CLAUDE.md`를 UTF-8로 끝까지 읽는다.
2. 프로젝트 `CLAUDE.md`를 읽는다.
3. `docs/PROGRESS.md`, 이어서 `docs/CHANGELOG.md`를 읽는다.
4. Git 상태를 확인하고 사용자 WIP를 보존한다.

## SSOT와 갱신 위치

| 정보 | SSOT |
|---|---|
| 운영 규칙·경계 | `CLAUDE.md` |
| 현재 생명주기·진행 상태 | `docs/PROGRESS.md` |
| 날짜별 변경·상태 전환 | `docs/CHANGELOG.md` |
| 설계 결정 | `docs/adr/` |
| 프로젝트 목록 | GOLEM `catalog/projects.yaml` (소비만, 소유하지 않음) |

사용자의 최신 지시와 상위 Codex 정책을 우선한다. 상태를 이 파일에 복제하지
않는다.
