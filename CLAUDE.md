# Deuce

사람과 각자의 AI가 채널에서 함께 대화하는 채팅·협업 프로그램이다. 이
저장소가 프로젝트의 control repo이며, 프로젝트 운영 규칙과 상태 문서의 원본을
소유한다.

## 핵심 계약

- 현재 상태의 SSOT는 `docs/PROGRESS.md`다.
- 날짜별 변경 이력의 SSOT는 `docs/CHANGELOG.md`다.
- 로컬 포트폴리오 도구와 문서 게시 도구는 선택 사항이며 기여에 필요하지 않다.
- 제품 방향은 Teams·Slack에서 참고한 채팅 경험과 채널별 외부 AI 참여다.
  영상통화는 현재 범위에서 제외한다.
- 기능 우선순위와 릴리스 범위는 `docs/PROGRESS.md`에서 관리한다.
- 기술 스택과 배포 구성은 결정되기 전까지 추가하지 않는다.
- 운영 배포는 웹·Windows x64·Mac arm64/x64 설치 파일과 업데이트 피드를 같은 릴리스로 묶는다.

## 작업 진입

1. 글로벌 `~/.claude/CLAUDE.md`가 있으면 끝까지 읽는다.
2. 이 `CLAUDE.md`를 읽는다.
3. `docs/PROGRESS.md`, 이어서 `docs/CHANGELOG.md`를 읽는다.
4. `git status --short --branch`로 사용자 작업을 확인한다.

## 안전 경계

- 원격 저장소 생성, push, 배포, 인프라 변경은 감독의 명시적 승인 후 수행한다.
- 작업 종료와 커밋 전에 진행 상태·변경 이력·관련 ADR을 점검한다.
  글로벌 `update-docs` 스킬이 있으면 사용한다.
