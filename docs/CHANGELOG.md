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

- [feat] 서버 파운데이션 모노레포 부트스트랩 — pnpm workspace(`apps/server`,
  `packages/shared`), Fastify 5 ESM(NodeNext) 서버 스켈레톤, 공통
  tsconfig 베이스
- [feat] Prisma 스키마 — v1 채팅 도메인(User·Conversation·Message·
  Attachment·Reaction·ReadState·Mention) 모델링과 초기 마이그레이션,
  로컬 개발/테스트용 Postgres 16 docker-compose
- [feat] 세션·Google OAuth 인증 — `@fastify/secure-session` 쿠키 세션,
  Google 로그인 콜백(허용 이메일 목록 기반 접근 제어), `/auth/me`·
  `/auth/logout`
- [chore] Prisma·`@prisma/client` 6.19.3 정확 고정 — npm latest는
  prerelease(8.0.0-rc)이고 Prisma 7은 기존 `datasource url = env(...)`
  Migrate 설정 방식을 깨뜨려(어댑터·`prisma.config.ts` 필요) 6.x에 머문다.
  사유는 `docs/adr/003-prisma-6-pin.md` 참고
- [fix] 최종 리뷰 수정 웨이브 — `email_verified` 미검증(Critical), 콜백
  예외 메시지 노출, oauthState 재생 공격, 보안 계약(§8) 테스트 공백,
  서버 부팅 경로의 암묵적 env 로딩 등 Critical 1건·Important 5건·
  Minor 4건 수정. 상세는 PR #2 (커밋 9c9e7d0·e40c128) 참고
