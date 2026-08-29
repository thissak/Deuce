# Changelog

### 2026-08-29

- [docs] v1 스펙 확정 — 골든랩 내부용, Teams '채팅' 탭 재현(1:1·그룹 채팅,
  인용 답장, 고정, 읽음 커서, 검색, 프레즌스) + 프로젝트 사이트 iframe 임베드
  모듈. 실사용 스크린샷 확인 결과 팀/채널은 거의 안 쓰여 v2로 이연.
  `docs/design/2026-08-29-deuce-v1-spec.md`
- [docs] ADR 001 — TS 풀스택 모노레포(Fastify·Socket.IO·Prisma·PostgreSQL,
  React·Vite·react-query) + Electron 데스크톱. Go 서버·Mattermost 배포 기각
- [docs] ADR 002 — 임베드는 iframe 방식만. 리뷰게이트 뷰어의 iframe +
  postMessage 검증 패턴 재사용, same-site 쿠키로 호스트 인증 코드 0줄

- [feat] `Deuce` 프로젝트 초기화 — Microsoft Teams와 같은 기능 범위의 팀 커뮤니케이션·협업 프로그램을 위한 control repo와 문서 SSOT 생성
- [chore] GOLEM 카탈로그 등록 및 골든노트 연결 활성화 — 프로젝트 위치와 상태 문서의 중앙 탐색 경로 마련
