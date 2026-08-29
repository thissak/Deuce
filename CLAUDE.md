# Deuce

Microsoft Teams와 같은 기능 범위의 팀 커뮤니케이션·협업 프로그램이다. 이
저장소가 프로젝트의 control repo이며, 프로젝트 운영 규칙과 상태 문서의 원본을
소유한다.

## 핵심 계약

- 현재 상태의 SSOT는 `docs/PROGRESS.md`다.
- 날짜별 변경 이력의 SSOT는 `docs/CHANGELOG.md`다.
- 프로젝트 식별자와 위치는 GOLEM `catalog/projects.yaml`에서 관리한다.
- 골든노트는 프로젝트 문서를 읽어 게시할 수 있지만 원본을 수정하지 않는다.
- 제품 목표는 Microsoft Teams와 같은 기능 범위의 팀 커뮤니케이션·협업 경험이다.
- 기능 우선순위와 릴리스 범위는 `docs/PROGRESS.md`에서 관리한다.
- 기술 스택과 배포 구성은 결정되기 전까지 추가하지 않는다.

## 작업 진입

1. 글로벌 `~/.claude/CLAUDE.md`를 끝까지 읽는다.
2. 이 `CLAUDE.md`를 읽는다.
3. `docs/PROGRESS.md`, 이어서 `docs/CHANGELOG.md`를 읽는다.
4. `git status --short --branch`로 사용자 작업을 확인한다.

## 안전 경계

- 원격 저장소 생성, push, 배포, 인프라 변경은 감독의 명시적 승인 후 수행한다.
- 작업 종료와 커밋 전에 글로벌 `update-docs`로 문서를 점검한다.
