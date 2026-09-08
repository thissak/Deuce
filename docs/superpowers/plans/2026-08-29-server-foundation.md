# Deuce 서버 파운데이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pnpm 모노레포를 부트스트랩하고, PostgreSQL 스키마 전체와 Google OAuth 로그인(허용목록·세션 쿠키)을 갖춘 Fastify 서버를 세운다.

**Architecture:** 모노레포(`apps/server`, `packages/shared`)에 Fastify ESM 서버를 만들고, Prisma로 v1 데이터 모델 전체를 마이그레이션한다. 인증은 Google OAuth(코드 교환은 주입 가능한 함수로 분리해 테스트에서 페이크 사용) + `@fastify/secure-session` httpOnly 쿠키 + 허용 이메일 목록.

**Tech Stack:** Node.js 22, pnpm, TypeScript(strict, ESM), Fastify 5, Prisma + PostgreSQL 16(docker compose), zod, google-auth-library, @fastify/secure-session, vitest.

**Spec:** `docs/design/2026-08-29-deuce-v1-spec.md`

**전체 로드맵에서의 위치:** 6개 계획 중 1번. 후속 — ② 대화·메시지 REST+검색, ③ Socket.IO 실시간·프레즌스·파일, ④ 웹 SPA, ⑤ Electron 셸, ⑥ 임베드+배포. 후속 계획은 이 계획 완료 후 작성한다.

## Global Constraints

- 모든 패키지는 ESM(`"type": "module"`) + TypeScript strict. 빌드 검증은 `tsc --noEmit`.
- 실시간·인증·세션 프리미티브는 손코딩하지 않는다 — 검증된 라이브러리(@fastify/secure-session, google-auth-library)만 사용 (글로벌 STOP 규칙).
- DB는 PostgreSQL 16. 로컬 개발 포트 **5434** (GateLab의 5433과 충돌 회피). 서버 포트 기본 **4000**.
- 테스트는 실제 로컬 PostgreSQL(`deuce_test` DB) 대상. 목 DB 금지.
- 스펙 §6의 엔티티 이름을 그대로 쓴다: User, Conversation(type: DM|GROUP|CHANNEL — CHANNEL은 v2 예약), ConversationMember, Message, Attachment, Reaction, ReadState, Mention.
- 커밋은 각 태스크의 명시된 파일만 `git add` 한다(문서·설정 파일을 쓸어 담지 않는다). 저장소 첫 커밋(기존 docs/, CLAUDE.md)은 감독이 별도 수행하므로 건드리지 않는다.
- 실 Google OAuth 클라이언트 ID/시크릿 발급(GCP 콘솔)은 감독 승인 사항 — 이 계획에서는 `.env.example`까지만 만들고 실값은 넣지 않는다. 테스트는 페이크 교환기로 돈다.

---

### Task 1: 모노레포 스캐폴드 + Fastify 서버 뼈대 + 헬스체크

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/vitest.config.ts`
- Create: `apps/server/src/app.ts`, `apps/server/src/main.ts`
- Test: `apps/server/test/health.test.ts`

**Interfaces:**
- Consumes: 없음 (최초 태스크)
- Produces: `buildApp(): Promise<FastifyInstance>` (`apps/server/src/app.ts`) — 이후 모든 태스크가 이 팩토리를 확장한다. `GET /health` → `200 {"status":"ok"}`.

- [ ] **Step 1: 워크스페이스 뼈대 생성**

`pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

루트 `package.json`:

```json
{
  "name": "deuce",
  "private": true,
  "scripts": {
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  }
}
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`.gitignore`:

```
node_modules/
dist/
.env
*.log
```

- [ ] **Step 2: server 패키지 생성 + 의존성 설치**

`apps/server/package.json`:

```json
{
  "name": "@deuce/server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

`apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`apps/server/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // DB 테스트가 같은 로컬 DB를 트런케이트하므로 파일 병렬 실행 금지
    fileParallelism: false,
  },
})
```

실행: `cd apps/server && pnpm add fastify && pnpm add -D typescript tsx vitest @types/node`

- [ ] **Step 3: 실패하는 테스트 작성** — `apps/server/test/health.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

describe('GET /health', () => {
  it('returns ok', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok' })
  })
})
```

- [ ] **Step 4: 실패 확인**

Run: `cd apps/server && pnpm test`
Expected: FAIL — `Cannot find module '../src/app.js'`

- [ ] **Step 5: 최소 구현** — `apps/server/src/app.ts`

```ts
import Fastify, { type FastifyInstance } from 'fastify'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
```

`apps/server/src/main.ts`:

```ts
import { buildApp } from './app.js'

const app = await buildApp()
const port = Number(process.env.PORT ?? 4000)
await app.listen({ port, host: '0.0.0.0' })
```

- [ ] **Step 6: 테스트·타입체크 통과 확인**

Run: `cd apps/server && pnpm test && pnpm typecheck`
Expected: PASS (1 test), 타입 에러 0

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore pnpm-lock.yaml apps/server
git commit -m "feat: bootstrap pnpm monorepo with fastify server skeleton"
```

---

### Task 2: 로컬 PostgreSQL + Prisma 스키마 전체 + 테스트 DB 헬퍼

**Files:**
- Create: `docker-compose.yml`, `docker/postgres-init.sql`
- Create: `apps/server/prisma/schema.prisma`, `apps/server/.env`(로컬 전용, 커밋 금지), `apps/server/.env.example`
- Create: `apps/server/src/db.ts`, `apps/server/test/setup.ts`, `apps/server/test/helpers.ts`
- Modify: `apps/server/package.json` (scripts), `apps/server/vitest.config.ts` (setupFiles)
- Test: `apps/server/test/schema.test.ts`

**Interfaces:**
- Consumes: Task 1의 워크스페이스
- Produces: `prisma`(PrismaClient 싱글턴, `src/db.ts`), `resetDb(): Promise<void>`·`testDb`(`test/helpers.ts`) — 이후 모든 DB 테스트가 사용. 스키마 모델명: User, Conversation, ConversationMember, Message, Attachment, Reaction, ReadState, Mention.

- [ ] **Step 1: PostgreSQL 컨테이너 정의**

`docker-compose.yml` (루트):

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: deuce
      POSTGRES_PASSWORD: deuce
      POSTGRES_DB: deuce
    ports:
      - "5434:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/postgres-init.sql:/docker-entrypoint-initdb.d/init.sql
volumes:
  pgdata:
```

`docker/postgres-init.sql`:

```sql
CREATE DATABASE deuce_test;
```

Run: `docker compose up -d` → `docker compose ps`로 healthy 확인

- [ ] **Step 2: Prisma 설치와 스키마 작성**

Run: `cd apps/server && pnpm add @prisma/client && pnpm add -D prisma`

`apps/server/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id          String   @id @default(uuid())
  email       String   @unique
  name        String
  avatarUrl   String?
  createdAt   DateTime @default(now())
  memberships ConversationMember[]
  messages    Message[]
  reactions   Reaction[]
  readStates  ReadState[]
  mentions    Mention[]
}

// CHANNEL은 v2 팀/채널 확장용 예약값 — v1에서는 DM·GROUP만 생성한다
enum ConversationType {
  DM
  GROUP
  CHANNEL
}

model Conversation {
  id         String           @id @default(uuid())
  type       ConversationType
  title      String?          // DM은 null, 그룹은 방 이름
  embedKey   String?          @unique // 임베드 모듈용, 계획 ⑥에서 사용
  createdAt  DateTime         @default(now())
  members    ConversationMember[]
  messages   Message[]
  readStates ReadState[]
}

model ConversationMember {
  conversationId String
  userId         String
  joinedAt       DateTime  @default(now())
  mutedAt        DateTime?
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([conversationId, userId])
}

model Message {
  id             String    @id @default(uuid())
  conversationId String
  authorId       String
  body           String
  replyToId      String?   // 평면 인용 (스레드 아님)
  createdAt      DateTime  @default(now())
  editedAt       DateTime?
  deletedAt      DateTime? // 소프트 삭제
  pinnedAt       DateTime?
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  author         User         @relation(fields: [authorId], references: [id])
  replyTo        Message?     @relation("Quote", fields: [replyToId], references: [id])
  quotedBy       Message[]    @relation("Quote")
  attachments    Attachment[]
  reactions      Reaction[]
  mentions       Mention[]

  @@index([conversationId, createdAt])
}

model Attachment {
  id          String @id @default(uuid())
  messageId   String
  objectKey   String // GCS 오브젝트 키
  fileName    String
  size        Int
  contentType String
  message     Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
}

model Reaction {
  messageId String
  userId    String
  emoji     String
  createdAt DateTime @default(now())
  message   Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@id([messageId, userId, emoji])
}

model ReadState {
  userId            String
  conversationId    String
  lastReadMessageId String?
  updatedAt         DateTime @updatedAt
  user              User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  conversation      Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@id([userId, conversationId])
}

model Mention {
  id              String   @id @default(uuid())
  messageId       String
  mentionedUserId String
  createdAt       DateTime @default(now())
  message         Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  mentioned       User    @relation(fields: [mentionedUserId], references: [id], onDelete: Cascade)

  @@index([mentionedUserId, createdAt])
}
```

- [ ] **Step 3: env 파일과 스크립트**

`apps/server/.env` (커밋 금지 — .gitignore가 이미 막는다):

```
DATABASE_URL=postgresql://deuce:deuce@localhost:5434/deuce
```

`apps/server/.env.example`:

```
DATABASE_URL=postgresql://deuce:deuce@localhost:5434/deuce
PORT=4000
SESSION_KEY_HEX=          # openssl rand -hex 32
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback
ALLOWED_EMAILS=you@goldenlabs.dev
```

`apps/server/package.json`의 scripts에 추가:

```json
"db:migrate": "prisma migrate dev",
"db:migrate:test": "DATABASE_URL=postgresql://deuce:deuce@localhost:5434/deuce_test prisma migrate deploy"
```

- [ ] **Step 4: 마이그레이션 생성·적용**

Run: `cd apps/server && pnpm db:migrate --name init && pnpm db:migrate:test`
Expected: `prisma/migrations/*_init/` 생성, 두 DB 모두 적용 성공

- [ ] **Step 5: DB 싱글턴과 테스트 헬퍼**

`apps/server/src/db.ts`:

```ts
import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()
```

`apps/server/test/setup.ts` (모든 테스트보다 먼저 실행 — 테스트용 env 고정):

```ts
process.env.DATABASE_URL = 'postgresql://deuce:deuce@localhost:5434/deuce_test'
process.env.SESSION_KEY_HEX = 'a'.repeat(64)
process.env.GOOGLE_CLIENT_ID = 'test-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
process.env.GOOGLE_CALLBACK_URL = 'http://localhost:4000/auth/google/callback'
process.env.ALLOWED_EMAILS = 'a@goldenlabs.dev,b@goldenlabs.dev'
```

`apps/server/vitest.config.ts`의 `test` 블록에 추가: `setupFiles: ['./test/setup.ts'],`

`apps/server/test/helpers.ts`:

```ts
import { PrismaClient } from '@prisma/client'

export const testDb = new PrismaClient()

export async function resetDb(): Promise<void> {
  await testDb.$executeRawUnsafe(
    'TRUNCATE TABLE "Mention", "Reaction", "ReadState", "Attachment", "Message", "ConversationMember", "Conversation", "User" CASCADE',
  )
}
```

- [ ] **Step 6: 스키마 스모크 테스트 작성** — `apps/server/test/schema.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb, testDb } from './helpers.js'

describe('db schema', () => {
  beforeEach(resetDb)

  it('creates a user, dm conversation, message and quote reply', async () => {
    const user = await testDb.user.create({
      data: { email: 'a@goldenlabs.dev', name: 'A' },
    })
    const convo = await testDb.conversation.create({
      data: { type: 'DM', members: { create: [{ userId: user.id }] } },
    })
    const message = await testDb.message.create({
      data: { conversationId: convo.id, authorId: user.id, body: '안녕하세요' },
    })
    const reply = await testDb.message.create({
      data: {
        conversationId: convo.id,
        authorId: user.id,
        body: '답장입니다',
        replyToId: message.id,
      },
    })
    expect(reply.replyToId).toBe(message.id)
    expect(message.deletedAt).toBeNull()
  })
})
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `cd apps/server && pnpm test`
Expected: PASS (health + schema, 2 파일)

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml docker/postgres-init.sql apps/server/prisma apps/server/.env.example apps/server/src/db.ts apps/server/test apps/server/package.json apps/server/vitest.config.ts pnpm-lock.yaml
git commit -m "feat: add postgres schema for v1 chat domain with prisma"
```

---

### Task 3: 설정 로딩 + 세션 플러그인 + /auth/me·logout

**Files:**
- Create: `apps/server/src/config.ts`, `apps/server/src/auth/session.ts`, `apps/server/src/auth/routes.ts`
- Modify: `apps/server/src/app.ts`
- Test: `apps/server/test/auth-session.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 2), `buildApp` (Task 1)
- Produces:
  - `loadConfig(env?): AppConfig` — `{ port: number; databaseUrl: string; sessionKey: Buffer; google: { clientId: string; clientSecret: string; callbackUrl: string }; allowedEmails: string[]; isProd: boolean }`
  - `buildApp(opts?: AppOptions)` — `AppOptions = { config?: AppConfig; exchangeGoogleCode?: GoogleCodeExchanger }` (exchangeGoogleCode는 Task 4에서 사용)
  - 세션 키: `req.session.get('userId')` / `req.session.get('oauthState')`
  - `GET /auth/me` → 200 `{ id, email, name, avatarUrl }` 또는 401, `POST /auth/logout` → 204

- [ ] **Step 1: 의존성 설치**

Run: `cd apps/server && pnpm add @fastify/secure-session zod`

- [ ] **Step 2: 실패하는 테스트 작성** — `apps/server/test/auth-session.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

describe('session auth', () => {
  it('returns 401 from /auth/me without a session', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/auth/me' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 204 from /auth/logout', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'POST', url: '/auth/logout' })
    expect(res.statusCode).toBe(204)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `cd apps/server && pnpm test`
Expected: FAIL — /auth/me가 404

- [ ] **Step 4: 구현**

`apps/server/src/config.ts`:

```ts
import { z } from 'zod'

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  SESSION_KEY_HEX: z.string().regex(/^[0-9a-f]{64}$/),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),
  ALLOWED_EMAILS: z.string().min(1),
  NODE_ENV: z.string().default('development'),
})

export interface AppConfig {
  port: number
  databaseUrl: string
  sessionKey: Buffer
  google: { clientId: string; clientSecret: string; callbackUrl: string }
  allowedEmails: string[]
  isProd: boolean
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env)
  return {
    port: parsed.PORT,
    databaseUrl: parsed.DATABASE_URL,
    sessionKey: Buffer.from(parsed.SESSION_KEY_HEX, 'hex'),
    google: {
      clientId: parsed.GOOGLE_CLIENT_ID,
      clientSecret: parsed.GOOGLE_CLIENT_SECRET,
      callbackUrl: parsed.GOOGLE_CALLBACK_URL,
    },
    allowedEmails: parsed.ALLOWED_EMAILS.split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    isProd: parsed.NODE_ENV === 'production',
  }
}
```

`apps/server/src/auth/session.ts` (세션 데이터 타입 선언):

```ts
declare module '@fastify/secure-session' {
  interface SessionData {
    userId: string
    oauthState: string
  }
}

export {}
```

`apps/server/src/auth/routes.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import type { AppConfig } from '../config.js'
import { prisma } from '../db.js'
import '../auth/session.js'

export interface AuthDeps {
  config: AppConfig
}

export async function authRoutes(app: FastifyInstance, deps: AuthDeps): Promise<void> {
  app.get('/auth/me', async (req, reply) => {
    const userId = req.session.get('userId')
    if (!userId) return reply.code(401).send({ error: 'unauthorized' })
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      req.session.delete()
      return reply.code(401).send({ error: 'unauthorized' })
    }
    return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl }
  })

  app.post('/auth/logout', async (req, reply) => {
    req.session.delete()
    return reply.code(204).send()
  })
}
```

`apps/server/src/app.ts` 전체 교체:

```ts
import Fastify, { type FastifyInstance } from 'fastify'
import secureSession from '@fastify/secure-session'
import { loadConfig, type AppConfig } from './config.js'
import { authRoutes } from './auth/routes.js'

export interface AppOptions {
  config?: AppConfig
  // Task 4에서 사용: 테스트가 구글 코드 교환을 페이크로 대체한다
  exchangeGoogleCode?: (code: string) => Promise<{
    email: string
    name: string
    avatarUrl: string | null
  }>
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? loadConfig()
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })

  await app.register(secureSession, {
    key: config.sessionKey,
    cookie: { path: '/', httpOnly: true, sameSite: 'lax', secure: config.isProd },
  })

  app.get('/health', async () => ({ status: 'ok' }))
  await app.register(authRoutes, { config })

  return app
}
```

주의: `app.register(authRoutes, { config })`가 동작하려면 `authRoutes`의 두 번째
인자 타입이 Fastify 플러그인 옵션과 호환돼야 한다. 위 시그니처 그대로 두면 된다
(Fastify는 두 번째 인자를 옵션 객체로 전달한다).

- [ ] **Step 5: 테스트 통과·타입체크 확인**

Run: `cd apps/server && pnpm test && pnpm typecheck`
Expected: PASS (기존 테스트 포함 전부)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src apps/server/test apps/server/package.json pnpm-lock.yaml
git commit -m "feat: add env config, secure session and auth/me endpoints"
```

---

### Task 4: Google 로그인 플로우 + 허용목록 + shared UserDto

**Files:**
- Create: `apps/server/src/auth/google.ts`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`, `packages/shared/src/user.ts`
- Modify: `apps/server/src/auth/routes.ts`, `apps/server/src/app.ts`, `apps/server/package.json`
- Test: `apps/server/test/auth-google.test.ts`

**Interfaces:**
- Consumes: `AppConfig`·`buildApp`·세션 (Task 3), `prisma` (Task 2)
- Produces:
  - `GoogleProfile = { email: string; name: string; avatarUrl: string | null }`
  - `GoogleCodeExchanger = (code: string) => Promise<GoogleProfile>`
  - `createAuthUrl(config: AppConfig, state: string): string`, `createGoogleCodeExchanger(config: AppConfig): GoogleCodeExchanger`
  - `GET /auth/google` → 302(구글로), `GET /auth/google/callback?code&state` → 302 `/` (성공) | 400(state 불일치) | 403(허용목록 밖)
  - `@deuce/shared`의 `UserDtoSchema`(zod)·`UserDto` — 이후 웹 SPA 계획이 소비

- [ ] **Step 1: shared 패키지 생성**

`packages/shared/package.json`:

```json
{
  "name": "@deuce/shared",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "echo no tests", "typecheck": "tsc --noEmit" }
}
```

`packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

`packages/shared/src/user.ts`:

```ts
import { z } from 'zod'

export const UserDtoSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
})

export type UserDto = z.infer<typeof UserDtoSchema>
```

`packages/shared/src/index.ts`:

```ts
export { UserDtoSchema, type UserDto } from './user.js'
```

Run: `cd packages/shared && pnpm add zod`
Run: `cd apps/server && pnpm add google-auth-library && pnpm add '@deuce/shared@workspace:*'`

- [ ] **Step 2: 실패하는 테스트 작성** — `apps/server/test/auth-google.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { LightMyRequestResponse } from 'fastify'
import { UserDtoSchema } from '@deuce/shared'
import { buildApp } from '../src/app.js'
import { resetDb } from './helpers.js'

function cookieHeader(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie']
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list.map((c) => c.split(';')[0]).join('; ')
}

async function completeLogin(app: Awaited<ReturnType<typeof buildApp>>) {
  const start = await app.inject({ method: 'GET', url: '/auth/google' })
  expect(start.statusCode).toBe(302)
  const state = new URL(start.headers.location as string).searchParams.get('state')!
  return app.inject({
    method: 'GET',
    url: `/auth/google/callback?code=fake-code&state=${state}`,
    headers: { cookie: cookieHeader(start) },
  })
}

describe('google login', () => {
  beforeEach(resetDb)

  it('logs in an allowed user and serves /auth/me', async () => {
    const app = await buildApp({
      exchangeGoogleCode: async () => ({
        email: 'a@goldenlabs.dev',
        name: '테스터',
        avatarUrl: null,
      }),
    })
    const cb = await completeLogin(app)
    expect(cb.statusCode).toBe(302)
    expect(cb.headers.location).toBe('/')

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(cb) },
    })
    expect(me.statusCode).toBe(200)
    const dto = UserDtoSchema.parse(me.json())
    expect(dto.email).toBe('a@goldenlabs.dev')
    expect(dto.name).toBe('테스터')
  })

  it('rejects an email outside the allowlist with 403', async () => {
    const app = await buildApp({
      exchangeGoogleCode: async () => ({
        email: 'outsider@example.com',
        name: 'X',
        avatarUrl: null,
      }),
    })
    const cb = await completeLogin(app)
    expect(cb.statusCode).toBe(403)
  })

  it('rejects a mismatched oauth state with 400', async () => {
    const app = await buildApp({
      exchangeGoogleCode: async () => ({
        email: 'a@goldenlabs.dev',
        name: 'A',
        avatarUrl: null,
      }),
    })
    const start = await app.inject({ method: 'GET', url: '/auth/google' })
    const res = await app.inject({
      method: 'GET',
      url: '/auth/google/callback?code=fake&state=wrong',
      headers: { cookie: cookieHeader(start) },
    })
    expect(res.statusCode).toBe(400)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `cd apps/server && pnpm test`
Expected: FAIL — /auth/google이 404

- [ ] **Step 4: 구현**

`apps/server/src/auth/google.ts`:

```ts
import { OAuth2Client } from 'google-auth-library'
import type { AppConfig } from '../config.js'

export interface GoogleProfile {
  email: string
  name: string
  avatarUrl: string | null
}

export type GoogleCodeExchanger = (code: string) => Promise<GoogleProfile>

function newClient(config: AppConfig): OAuth2Client {
  return new OAuth2Client(
    config.google.clientId,
    config.google.clientSecret,
    config.google.callbackUrl,
  )
}

export function createAuthUrl(config: AppConfig, state: string): string {
  return newClient(config).generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
  })
}

export function createGoogleCodeExchanger(config: AppConfig): GoogleCodeExchanger {
  return async (code) => {
    const client = newClient(config)
    const { tokens } = await client.getToken(code)
    if (!tokens.id_token) throw new Error('구글 응답에 id_token이 없습니다')
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.google.clientId,
    })
    const payload = ticket.getPayload()
    if (!payload?.email) throw new Error('구글 프로필에 이메일이 없습니다')
    return {
      email: payload.email,
      name: payload.name ?? payload.email,
      avatarUrl: payload.picture ?? null,
    }
  }
}
```

`apps/server/src/auth/routes.ts` 전체 교체:

```ts
import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { AppConfig } from '../config.js'
import { prisma } from '../db.js'
import { createAuthUrl, type GoogleCodeExchanger } from './google.js'
import './session.js'

export interface AuthDeps {
  config: AppConfig
  exchange: GoogleCodeExchanger
}

export async function authRoutes(app: FastifyInstance, deps: AuthDeps): Promise<void> {
  const { config, exchange } = deps

  app.get('/auth/google', async (req, reply) => {
    const state = randomBytes(16).toString('hex')
    req.session.set('oauthState', state)
    return reply.redirect(createAuthUrl(config, state))
  })

  app.get('/auth/google/callback', async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string }
    if (!code || !state || state !== req.session.get('oauthState')) {
      return reply.code(400).send({ error: 'invalid oauth state' })
    }
    const profile = await exchange(code)
    const email = profile.email.toLowerCase()
    if (!config.allowedEmails.includes(email)) {
      return reply.code(403).send({ error: 'not allowed' })
    }
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, name: profile.name, avatarUrl: profile.avatarUrl },
      update: { name: profile.name, avatarUrl: profile.avatarUrl },
    })
    req.session.set('userId', user.id)
    return reply.redirect('/')
  })

  app.get('/auth/me', async (req, reply) => {
    const userId = req.session.get('userId')
    if (!userId) return reply.code(401).send({ error: 'unauthorized' })
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      req.session.delete()
      return reply.code(401).send({ error: 'unauthorized' })
    }
    return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl }
  })

  app.post('/auth/logout', async (req, reply) => {
    req.session.delete()
    return reply.code(204).send()
  })
}
```

`apps/server/src/app.ts`에서 등록부만 수정 — `AppOptions.exchangeGoogleCode`의
타입을 `GoogleCodeExchanger`(import)로 바꾸고:

```ts
import { createGoogleCodeExchanger, type GoogleCodeExchanger } from './auth/google.js'
```

```ts
  const exchange = opts.exchangeGoogleCode ?? createGoogleCodeExchanger(config)
  await app.register(authRoutes, { config, exchange })
```

- [ ] **Step 5: 테스트·타입체크 통과 확인**

Run: `cd apps/server && pnpm test && pnpm typecheck && cd ../../packages/shared && pnpm typecheck`
Expected: 전부 PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared apps/server/src apps/server/test apps/server/package.json pnpm-lock.yaml
git commit -m "feat: add google oauth login with allowlist and shared user dto"
```

---

## Self-Review 결과

- 스펙 §8(인증) 전부 커버: Google OAuth·허용목록·httpOnly `SameSite=Lax` 쿠키. §6 데이터 모델 8개 엔티티 전부 Task 2 스키마에 포함(검색용 pg_trgm 인덱스는 계획 ②의 검색 태스크에서 `CREATE EXTENSION` 마이그레이션과 함께 추가 — 스키마 변경 없음).
- 남은 스펙 요구(§3~§7, §9~§10)는 후속 계획 ②~⑥ 소관. 이 계획 단독으로 "로그인 가능한 API 서버"라는 동작 소프트웨어를 낸다.
- 타입 일관성: `GoogleCodeExchanger`·`AppConfig`·`AuthDeps` 시그니처를 태스크 간 동일하게 사용. Task 3의 임시 인라인 exchanger 타입은 Task 4에서 import 타입으로 교체하도록 명시.
