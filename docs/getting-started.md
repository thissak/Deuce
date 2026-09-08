# 로컬 개발

Node.js 24 또는 26, pnpm 11.24.0, Docker Compose가 필요합니다.
CI는 Node 24/26과 PostgreSQL 16을 사용합니다. TypeScript 전체 스택이며 Go는 필요하지 않습니다.

## 설치와 자동 테스트

```bash
git clone https://github.com/thissak/Deuce.git
cd Deuce
npm install --global pnpm@11.24.0
pnpm install --frozen-lockfile
docker compose up -d --wait
pnpm --filter @deuce/server exec prisma generate
pnpm --filter @deuce/server db:migrate:test
pnpm test
pnpm typecheck
pnpm build
```

저장소가 비공개인 준비 기간에는 GitHub 접근 권한이 있어야 clone할 수 있습니다.
자동 테스트와 소스 빌드는 Google OAuth나 운영 VM 접근 없이 실행됩니다.
`pnpm build`는 웹·MCP·데스크톱 소스를 빌드하며 설치 파일 제작·서명·배포는 하지 않습니다.

개발 DB는 `localhost:5434/deuce`, 테스트 DB는 `localhost:5434/deuce_test`입니다.
테스트가 `deuce_test`를 초기화하므로 테스트용으로만 사용합니다. 5434 포트를 기존 개발
PostgreSQL 컨테이너가 쓰고 있다면 중복 기동하지 마세요. Compose 초기 SQL은 볼륨을
처음 만들 때만 실행됩니다. 기존 개발 볼륨에 테스트 DB가 없다면 한 번 실행합니다.

```bash
docker compose exec postgres psql -U deuce -d deuce -c 'CREATE DATABASE deuce_test;'
```

## 웹 실행과 실제 로그인

```bash
cp apps/server/.env.example apps/server/.env
openssl rand -hex 32
```

생성한 값을 `.env`의 `SESSION_KEY_HEX`에 넣습니다. 자신의 Google 프로젝트에서
OAuth **웹 애플리케이션** 클라이언트를 만들고 설정합니다.

| 설정 | 값 |
|---|---|
| 승인된 리디렉션 URI | `http://localhost:5173/auth/google/callback` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 자신의 웹 OAuth 값 |
| `GOOGLE_CALLBACK_URL` | 위 리디렉션 URI와 동일 |
| `ALLOWED_EMAILS` | 로그인할 Google 이메일을 쉼표로 나열 |

Google 동의 화면의 공개/테스트 정책도 자신의 프로젝트에서 설정합니다. 필요하면
테스트 계정을 등록하세요. 로그인 요청 범위는 `openid email profile`입니다.

```bash
pnpm --filter @deuce/server db:migrate
pnpm dev
```

브라우저에서 **http://localhost:5173**을 엽니다. 서버는 4000, 웹은 5173입니다.
웹 개발 서버가 API·로그인·Socket.IO·MCP를 같은 원점으로 전달합니다.
로그인한 사용자가 사용자 목록에 생성되므로 대화 상대도 한 번 로그인해야 합니다.
더미 OAuth 값으로 서버는 기동할 수 있지만 실제 로그인은 되지 않습니다.

## 데스크톱 개발

일반 채팅 UI는 먼저 웹에서 개발합니다. 데스크톱 로그인에는 HTTPS 서버와 별도
Google **데스크톱 앱** OAuth 클라이언트가 필요합니다.
[자체 서버와 앱 제작](self-hosting.md)을 참고하세요.
