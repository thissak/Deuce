# Deuce

Microsoft Teams와 같은 기능 범위의 팀 커뮤니케이션·협업 프로그램. 프로젝트
운영 규칙과 상태 문서는 `CLAUDE.md`와 `docs/`를 참고한다.

## 부트스트랩

```bash
pnpm install
docker compose up -d
cp apps/server/.env.example apps/server/.env   # 값 채우기 (아래 참고)
pnpm --filter @deuce/server db:migrate
pnpm --filter @deuce/server db:migrate:test
pnpm dev     # apps/server 개발 서버 기동
pnpm test    # 전체 테스트
```

`apps/server/.env`는 커밋하지 않는다. 최소한 다음 값을 채워야 서버가
기동한다:

- `SESSION_KEY_HEX`: `openssl rand -hex 32`로 생성한 64자 hex 문자열
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: 로컬 개발에서는 더미 값으로도
  서버 기동은 가능하다 (실제 구글 로그인에는 유효한 OAuth 클라이언트 필요)

## Postgres 볼륨 주의

`docker/postgres-init.sql`은 `pgdata` 볼륨을 **처음 생성할 때만** 실행되어
`deuce_test` DB를 만든다. 이미 존재하는 `pgdata` 볼륨으로 컨테이너를 다시
띄운 경우(예: 볼륨을 지우지 않고 재시작) `deuce_test`가 없을 수 있다. 이
때는 직접 생성한다:

```bash
docker exec <postgres-container> psql -U deuce -c "CREATE DATABASE deuce_test;"
```

## 요구 사항

- Node 26, pnpm 11 (`packageManager` 필드로 고정)
- Prisma/`@prisma/client`는 `6.19.3`으로 고정한다 — 사유는
  `docs/adr/003-prisma-6-pin.md` 참고
