# Deuce 계획 ② — 대화·메시지 REST API + 검색 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 인증 가드 위에 대화방(DM·그룹)·메시지(작성·조회·수정·삭제·인용·멘션)·반응·고정·읽음 커서·검색·활동 피드의 REST API를 세운다.

**Architecture:** 계획 ①의 Fastify 서버에 fastify-plugin 기반 `authenticate` 데코레이터(세션 → 사용자 → 허용목록 재검사)와 전역 에러 핸들러를 얹고, `/api` 프리픽스 아래 라우트 플러그인들을 등록한다. 직렬화·요약 로직은 `src/domain/`·`src/serializers.ts`로 분리하고, 응답 계약은 `@deuce/shared`의 zod 스키마로 고정해 테스트가 스키마 파싱으로 검증한다. 검색은 pg_trgm GIN 인덱스 + ILIKE 부분일치.

**Tech Stack:** Fastify 5, fastify-plugin, Prisma 6.19.3(정확 핀), PostgreSQL 16 + pg_trgm, zod 4, vitest(실 DB).

**Spec:** `docs/design/2026-08-29-deuce-v1-spec.md` (§3 기능, §5 데이터 흐름, §6 데이터 모델, §8 인증)

**전체 로드맵에서의 위치:** 6개 계획 중 2번. 실시간 브로드캐스트·프레즌스·파일 첨부는 계획 ③, UI는 계획 ④. 이 계획은 REST 계약과 도메인 규칙만 다룬다.

## Global Constraints

- **Prisma·@prisma/client는 6.19.3 정확 핀 유지 (ADR 003). 업그레이드·신규 prisma 패키지 추가 금지.**
- ESM(`"type": "module"`) + TS strict + NodeNext — 상대 import에 `.js` 확장자 필수. `tsc --noEmit` 통과.
- 테스트는 실제 로컬 PostgreSQL `deuce_test`(포트 5434) 대상. 목 DB 금지. `resetDb()` 사용, vitest `fileParallelism: false`.
- 모든 `/api/*` 라우트는 `authenticate` preHandler 필수. 401(비로그인/허용목록 탈락), 403(멤버 아님/권한 없음), 404(대상 없음), 400(검증 실패) 규약.
- **허용목록 재검사는 매 요청 가드에서 수행한다** (계획 ① 이월 결정 — 허용목록에서 빼면 다음 요청부터 차단).
- **세션 만료는 14일로 명시한다** (계획 ① 이월 결정 — secure-session 기본 24h를 대체. GateLab ADR 003의 14일 전례).
- **`authenticate` 데코레이터는 fastify-plugin으로 감싼다** (이월 — 캡슐화 컨텍스트 탈출 필수).
- **전역 `setErrorHandler`**: statusCode < 500은 그대로, 그 외는 로그 남기고 `500 {"error":"internal error"}` — 내부 메시지 노출 금지 (이월).
- 신규 zod 코드는 v4 API(`z.enum`, `z.coerce` 등) 사용. 기존 파일의 `.email()` 등은 이 계획에서 건드리지 않는다.
- 소프트 삭제된 메시지는 응답에서 `deleted: true, body: ''`로 마스킹한다 (스펙 §3 "삭제된 메시지" 표시).
- 커밋은 각 태스크의 명시된 파일만. `apps/server/.env` 커밋 금지.
- 규모 전제: 동시 수십 명 — 요약 계산의 대화방별 개별 쿼리는 허용(YAGNI), 조기 최적화 금지.

## 파일 구조 (이 계획이 만들/고치는 것)

```
apps/server/src/
├── app.ts                    # (수정) 에러핸들러·세션만료·플러그인/라우트 등록
├── plugins/auth.ts           # (신규) authenticate 데코레이터 (fastify-plugin)
├── serializers.ts            # (신규) toUserDto, toMessageDto, messageInclude
├── domain/conversations.ts   # (신규) summarizeConversation, isMember
└── routes/
    ├── users.ts              # (신규) GET /users
    ├── conversations.ts      # (신규) 대화방 생성·목록·상세·관리·읽음
    ├── messages.ts           # (신규) 메시지 작성·조회·수정·삭제·반응·고정
    ├── search.ts             # (신규) GET /search
    └── activity.ts           # (신규) GET /activity
packages/shared/src/
├── conversation.ts           # (신규) ConversationSummarySchema
├── message.ts                # (신규) MessageDtoSchema
└── activity.ts               # (신규) SearchResultSchema, ActivityItemSchema
apps/server/test/
├── api-helpers.ts            # (신규) makeTestApp/loginAs/cookieHeader
├── guard.test.ts             # T1
├── conversations.test.ts     # T2
├── messages.test.ts          # T3
├── conversation-admin.test.ts# T4
├── message-actions.test.ts   # T5
└── search-activity.test.ts   # T6
```

---

### Task 1: 인증 가드(fastify-plugin) + 전역 에러 핸들러 + 세션 만료 14일

**Files:**
- Create: `apps/server/src/plugins/auth.ts`, `apps/server/test/api-helpers.ts`
- Modify: `apps/server/src/app.ts`, `apps/server/test/setup.ts` (ALLOWED_EMAILS에 c@ 추가)
- Test: `apps/server/test/guard.test.ts`

**Interfaces:**
- Consumes: `buildApp(opts?)`, `loadConfig()`, `prisma`, 세션 키 `userId` (계획 ①)
- Produces:
  - `app.authenticate: (req, reply) => Promise<void>` — preHandler용. 성공 시 `req.currentUser: { id, email, name, avatarUrl }` 설정, 실패 시 401
  - `makeTestApp(overrides?): Promise<{ app, loginAs }>` — `loginAs(email, name?) => Promise<cookie문자열>` (테스트 전용, OAuth 왕복으로 실제 로그인)
  - `cookieHeader(res): string`
  - 전역 에러 핸들러: 5xx는 `{"error":"internal error"}` 마스킹

- [ ] **Step 1: 의존성 설치**

Run: `cd apps/server && pnpm add fastify-plugin`

- [ ] **Step 2: 테스트 헬퍼 작성** — `apps/server/test/api-helpers.ts`

```ts
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { buildApp, type AppOptions } from '../src/app.js'
import type { GoogleProfile } from '../src/auth/google.js'

export function cookieHeader(res: LightMyRequestResponse): string {
  const raw = res.headers['set-cookie']
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  return list.map((c) => c.split(';')[0]).join('; ')
}

export interface TestApp {
  app: FastifyInstance
  loginAs: (email: string, name?: string) => Promise<string>
}

export async function makeTestApp(overrides: Partial<AppOptions> = {}): Promise<TestApp> {
  let profile: GoogleProfile = { email: 'a@goldenlabs.dev', name: 'A', avatarUrl: null }
  const app = await buildApp({
    exchangeGoogleCode: async () => profile,
    ...overrides,
  })
  async function loginAs(email: string, name = email.split('@')[0]!): Promise<string> {
    profile = { email, name, avatarUrl: null }
    const start = await app.inject({ method: 'GET', url: '/auth/google' })
    const state = new URL(start.headers.location as string).searchParams.get('state')!
    const cb = await app.inject({
      method: 'GET',
      url: `/auth/google/callback?code=fake&state=${state}`,
      headers: { cookie: cookieHeader(start) },
    })
    return cookieHeader(cb)
  }
  return { app, loginAs }
}
```

`test/setup.ts`의 ALLOWED_EMAILS 줄을 다음으로 교체:

```ts
process.env.ALLOWED_EMAILS = 'a@goldenlabs.dev,b@goldenlabs.dev,c@goldenlabs.dev'
```

- [ ] **Step 3: 실패하는 테스트 작성** — `apps/server/test/guard.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { loadConfig } from '../src/config.js'
import { makeTestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'

function addProbe(app: FastifyInstance): void {
  app.get('/api/_probe', { preHandler: app.authenticate }, async (req) => ({
    email: req.currentUser.email,
  }))
  app.get('/api/_boom', { preHandler: app.authenticate }, async () => {
    throw new Error('비밀 내부 정보')
  })
}

describe('authenticate guard & error handler', () => {
  beforeEach(resetDb)

  it('returns 401 without a session', async () => {
    const { app } = await makeTestApp()
    addProbe(app)
    const res = await app.inject({ method: 'GET', url: '/api/_probe' })
    expect(res.statusCode).toBe(401)
  })

  it('sets currentUser for a logged-in allowed user', async () => {
    const { app, loginAs } = await makeTestApp()
    addProbe(app)
    const cookie = await loginAs('a@goldenlabs.dev', 'A')
    const res = await app.inject({ method: 'GET', url: '/api/_probe', headers: { cookie } })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ email: 'a@goldenlabs.dev' })
  })

  it('rejects a session whose email left the allowlist', async () => {
    const first = await makeTestApp()
    addProbe(first.app)
    const cookie = await first.loginAs('a@goldenlabs.dev', 'A')
    const second = await makeTestApp({
      config: { ...loadConfig(), allowedEmails: ['b@goldenlabs.dev'] },
    })
    addProbe(second.app)
    const res = await second.app.inject({ method: 'GET', url: '/api/_probe', headers: { cookie } })
    expect(res.statusCode).toBe(401)
  })

  it('masks internal errors as 500 internal error', async () => {
    const { app, loginAs } = await makeTestApp()
    addProbe(app)
    const cookie = await loginAs('a@goldenlabs.dev', 'A')
    const res = await app.inject({ method: 'GET', url: '/api/_boom', headers: { cookie } })
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ error: 'internal error' })
    expect(res.payload).not.toContain('비밀')
  })
})
```

- [ ] **Step 4: 실패 확인**

Run: `cd apps/server && pnpm vitest run test/guard.test.ts`
Expected: FAIL — `app.authenticate`가 undefined (데코레이터 미존재)

- [ ] **Step 5: 구현**

`apps/server/src/plugins/auth.ts`:

```ts
import fp from 'fastify-plugin'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AppConfig } from '../config.js'
import { prisma } from '../db.js'
import '../auth/session.js'

export interface CurrentUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: CurrentUser
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export interface AuthPluginOptions {
  config: AppConfig
}

export const authPlugin = fp<AuthPluginOptions>(async (app, opts) => {
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.session.get('userId')
    if (!userId) return reply.code(401).send({ error: 'unauthorized' })
    const user = await prisma.user.findUnique({ where: { id: userId } })
    // 허용목록 매 요청 재검사 — 목록에서 빠지면 즉시 차단 (세션 회수 대체)
    if (!user || !opts.config.allowedEmails.includes(user.email)) {
      req.session.delete()
      return reply.code(401).send({ error: 'unauthorized' })
    }
    req.currentUser = { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl }
  })
})
```

`apps/server/src/app.ts` 수정 — secure-session 등록 옵션에 만료 추가:

```ts
  await app.register(secureSession, {
    key: config.sessionKey,
    // 내부 채팅 특성상 14일 세션 (GateLab ADR 003 전례). 기본값 24h를 대체한다.
    expiry: 60 * 60 * 24 * 14,
    cookie: { path: '/', httpOnly: true, sameSite: 'lax', secure: config.isProd },
  })
```

같은 파일, secure-session 등록 직후에 추가:

```ts
import { authPlugin } from './plugins/auth.js'
```

```ts
  await app.register(authPlugin, { config })

  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode ?? 500
    if (status < 500) return reply.code(status).send({ error: err.message })
    req.log.error(err)
    return reply.code(500).send({ error: 'internal error' })
  })
```

- [ ] **Step 6: 전체 테스트·타입체크 통과 확인** (기존 auth 테스트 포함 — 세션 만료 변경이 회귀를 만들지 않는지)

Run: `cd apps/server && pnpm test && pnpm typecheck`
Expected: 전부 PASS

- [ ] **Step 7: Commit**

```bash
git add apps/server/src apps/server/test apps/server/package.json pnpm-lock.yaml
git commit -m "feat: add authenticate guard with allowlist recheck and global error handler"
```

---

### Task 2: 사용자 목록 + 대화방 생성(DM 중복 방지)·목록

**Files:**
- Create: `apps/server/src/routes/users.ts`, `apps/server/src/routes/conversations.ts`, `apps/server/src/serializers.ts`, `apps/server/src/domain/conversations.ts`, `packages/shared/src/conversation.ts`
- Modify: `apps/server/src/app.ts` (라우트 등록), `packages/shared/src/index.ts`
- Test: `apps/server/test/conversations.test.ts`

**Interfaces:**
- Consumes: `app.authenticate`·`req.currentUser`·`makeTestApp` (Task 1), `prisma`, `UserDtoSchema`
- Produces:
  - `GET /api/users` → `UserDto[]` (이름순)
  - `POST /api/conversations` body `{ type:'dm', otherUserId }` | `{ type:'group', title, memberIds }` → 201 `ConversationSummary` (기존 DM 재요청 시 200 + 기존 dto)
  - `GET /api/conversations` → `ConversationSummary[]` (최근 메시지순)
  - `summarizeConversation(conversationId, meId): Promise<ConversationSummary>` / `isMember(conversationId, userId): Promise<boolean>` (`src/domain/conversations.ts`)
  - `toUserDto(user)` (`src/serializers.ts`)
  - `@deuce/shared`: `ConversationSummarySchema`, `ConversationSummary`

- [ ] **Step 1: shared 스키마** — `packages/shared/src/conversation.ts`

```ts
import { z } from 'zod'
import { UserDtoSchema } from './user.js'

export const ConversationSummarySchema = z.object({
  id: z.string(),
  type: z.enum(['DM', 'GROUP']),
  title: z.string().nullable(),
  displayName: z.string(),
  members: z.array(UserDtoSchema),
  lastMessage: z
    .object({
      id: z.string(),
      body: z.string(),
      authorName: z.string(),
      createdAt: z.string(),
    })
    .nullable(),
  unreadCount: z.number().int(),
  mutedAt: z.string().nullable(),
})

export type ConversationSummary = z.infer<typeof ConversationSummarySchema>
```

`packages/shared/src/index.ts`에 추가:

```ts
export { ConversationSummarySchema, type ConversationSummary } from './conversation.js'
```

- [ ] **Step 2: 실패하는 테스트 작성** — `apps/server/test/conversations.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ConversationSummarySchema, type UserDto } from '@deuce/shared'
import { makeTestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'

async function findUser(app: Awaited<ReturnType<typeof makeTestApp>>['app'], cookie: string, email: string): Promise<UserDto> {
  const res = await app.inject({ method: 'GET', url: '/api/users', headers: { cookie } })
  return (res.json() as UserDto[]).find((u) => u.email === email)!
}

describe('conversations api', () => {
  beforeEach(resetDb)

  it('rejects unauthenticated list', async () => {
    const { app } = await makeTestApp()
    const res = await app.inject({ method: 'GET', url: '/api/conversations' })
    expect(res.statusCode).toBe(401)
  })

  it('creates a dm, dedupes on second create, and lists it', async () => {
    const { app, loginAs } = await makeTestApp()
    const aCookie = await loginAs('a@goldenlabs.dev', 'A')
    await loginAs('b@goldenlabs.dev', 'B')
    const b = await findUser(app, aCookie, 'b@goldenlabs.dev')

    const first = await app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
      payload: { type: 'dm', otherUserId: b.id },
    })
    expect(first.statusCode).toBe(201)
    const dto = ConversationSummarySchema.parse(first.json())
    expect(dto.type).toBe('DM')
    expect(dto.displayName).toBe('B')
    expect(dto.unreadCount).toBe(0)

    const second = await app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
      payload: { type: 'dm', otherUserId: b.id },
    })
    expect(second.statusCode).toBe(200)
    expect((second.json() as { id: string }).id).toBe(dto.id)

    const list = await app.inject({ method: 'GET', url: '/api/conversations', headers: { cookie: aCookie } })
    expect(list.statusCode).toBe(200)
    const items = (list.json() as unknown[]).map((x) => ConversationSummarySchema.parse(x))
    expect(items).toHaveLength(1)
  })

  it('creates a group with title as displayName and auto-includes me', async () => {
    const { app, loginAs } = await makeTestApp()
    const aCookie = await loginAs('a@goldenlabs.dev', 'A')
    await loginAs('b@goldenlabs.dev', 'B')
    await loginAs('c@goldenlabs.dev', 'C')
    const b = await findUser(app, aCookie, 'b@goldenlabs.dev')
    const c = await findUser(app, aCookie, 'c@goldenlabs.dev')

    const res = await app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
      payload: { type: 'group', title: 'FA-50M 훈련 절차 QA', memberIds: [b.id, c.id] },
    })
    expect(res.statusCode).toBe(201)
    const dto = ConversationSummarySchema.parse(res.json())
    expect(dto.type).toBe('GROUP')
    expect(dto.displayName).toBe('FA-50M 훈련 절차 QA')
    expect(dto.members).toHaveLength(3)
  })

  it('rejects dm to self and unknown users', async () => {
    const { app, loginAs } = await makeTestApp()
    const aCookie = await loginAs('a@goldenlabs.dev', 'A')
    const me = await findUser(app, aCookie, 'a@goldenlabs.dev')
    const self = await app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
      payload: { type: 'dm', otherUserId: me.id },
    })
    expect(self.statusCode).toBe(400)
    const unknown = await app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
      payload: { type: 'dm', otherUserId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(unknown.statusCode).toBe(404)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `cd apps/server && pnpm vitest run test/conversations.test.ts`
Expected: FAIL — `/api/users`·`/api/conversations`가 404

- [ ] **Step 4: 구현**

`apps/server/src/serializers.ts`:

```ts
import type { User } from '@prisma/client'
import type { UserDto } from '@deuce/shared'

export function toUserDto(u: User): UserDto {
  return { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl }
}
```

`apps/server/src/domain/conversations.ts`:

```ts
import type { ConversationSummary } from '@deuce/shared'
import { prisma } from '../db.js'
import { toUserDto } from '../serializers.js'

export async function isMember(conversationId: string, userId: string): Promise<boolean> {
  const m = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  })
  return m !== null
}

// 수십 명 규모 전제의 대화방별 개별 쿼리 — 조기 최적화 금지 (Global Constraints)
export async function summarizeConversation(conversationId: string, meId: string): Promise<ConversationSummary> {
  const convo = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { members: { include: { user: true } } },
  })
  const last = await prisma.message.findFirst({
    where: { conversationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { author: true },
  })
  const read = await prisma.readState.findUnique({
    where: { userId_conversationId: { userId: meId, conversationId } },
  })
  let lastReadAt: Date | null = null
  if (read?.lastReadMessageId) {
    const lr = await prisma.message.findUnique({ where: { id: read.lastReadMessageId } })
    lastReadAt = lr?.createdAt ?? null
  }
  const unreadCount = await prisma.message.count({
    where: {
      conversationId,
      deletedAt: null,
      authorId: { not: meId },
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  })
  const meMember = convo.members.find((m) => m.userId === meId)
  const others = convo.members.filter((m) => m.userId !== meId)
  const displayName =
    convo.type === 'GROUP' ? (convo.title ?? '') : (others[0]?.user.name ?? '(알 수 없음)')
  return {
    id: convo.id,
    type: convo.type as 'DM' | 'GROUP',
    title: convo.title,
    displayName,
    members: convo.members.map((m) => toUserDto(m.user)),
    lastMessage: last
      ? { id: last.id, body: last.body, authorName: last.author.name, createdAt: last.createdAt.toISOString() }
      : null,
    unreadCount,
    mutedAt: meMember?.mutedAt?.toISOString() ?? null,
  }
}
```

`apps/server/src/routes/users.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../db.js'
import { toUserDto } from '../serializers.js'

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.get('/users', async () => {
    const users = await prisma.user.findMany({ orderBy: { name: 'asc' } })
    return users.map(toUserDto)
  })
}
```

`apps/server/src/routes/conversations.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { summarizeConversation } from '../domain/conversations.js'

const CreateSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('dm'), otherUserId: z.string() }),
  z.object({
    type: z.literal('group'),
    title: z.string().min(1).max(100),
    memberIds: z.array(z.string()).min(1).max(50),
  }),
])

export const conversationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.post('/conversations', async (req, reply) => {
    const parsed = CreateSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' })
    const me = req.currentUser.id

    if (parsed.data.type === 'dm') {
      const { otherUserId } = parsed.data
      if (otherUserId === me) return reply.code(400).send({ error: 'cannot dm yourself' })
      const other = await prisma.user.findUnique({ where: { id: otherUserId } })
      if (!other) return reply.code(404).send({ error: 'user not found' })
      const existing = await prisma.conversation.findFirst({
        where: {
          type: 'DM',
          AND: [
            { members: { some: { userId: me } } },
            { members: { some: { userId: otherUserId } } },
          ],
        },
      })
      if (existing) return reply.code(200).send(await summarizeConversation(existing.id, me))
      const convo = await prisma.conversation.create({
        data: { type: 'DM', members: { create: [{ userId: me }, { userId: otherUserId }] } },
      })
      return reply.code(201).send(await summarizeConversation(convo.id, me))
    }

    const memberIds = [...new Set([me, ...parsed.data.memberIds])]
    const found = await prisma.user.count({ where: { id: { in: memberIds } } })
    if (found !== memberIds.length) return reply.code(404).send({ error: 'user not found' })
    const convo = await prisma.conversation.create({
      data: {
        type: 'GROUP',
        title: parsed.data.title,
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
    })
    return reply.code(201).send(await summarizeConversation(convo.id, me))
  })

  app.get('/conversations', async (req) => {
    const me = req.currentUser.id
    const memberships = await prisma.conversationMember.findMany({ where: { userId: me } })
    const summaries = await Promise.all(
      memberships.map((m) => summarizeConversation(m.conversationId, me)),
    )
    summaries.sort((a, b) =>
      (b.lastMessage?.createdAt ?? '').localeCompare(a.lastMessage?.createdAt ?? ''),
    )
    return summaries
  })
}
```

`apps/server/src/app.ts` — 에러 핸들러 설정 아래에 등록 추가:

```ts
import { userRoutes } from './routes/users.js'
import { conversationRoutes } from './routes/conversations.js'
```

```ts
  await app.register(userRoutes, { prefix: '/api' })
  await app.register(conversationRoutes, { prefix: '/api' })
```

- [ ] **Step 5: 전체 테스트·양쪽 타입체크 통과 확인**

Run: `cd apps/server && pnpm test && pnpm typecheck && cd ../../packages/shared && pnpm typecheck`
Expected: 전부 PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src apps/server/test packages/shared/src pnpm-lock.yaml
git commit -m "feat: add users and conversations api with dm dedup and summaries"
```

---

### Task 3: 메시지 작성·조회 (인용·멘션·커서 페이지네이션)

**Files:**
- Create: `apps/server/src/routes/messages.ts`, `packages/shared/src/message.ts`
- Modify: `apps/server/src/serializers.ts` (toMessageDto·messageInclude 추가), `apps/server/src/app.ts` (등록), `packages/shared/src/index.ts`
- Test: `apps/server/test/messages.test.ts`

**Interfaces:**
- Consumes: `isMember` (Task 2), `app.authenticate`, `makeTestApp`
- Produces:
  - `POST /api/conversations/:id/messages` body `{ body, replyToId?, mentions? }` → 201 `MessageDto`. 규칙: 멤버만(403), replyToId는 같은 대화방 메시지(400), mentions는 전원 멤버(400), body 1~4000자
  - `GET /api/conversations/:id/messages?cursor&limit` → `{ items: MessageDto[], nextCursor: string|null }` — createdAt 내림차순, cursor는 마지막 항목 id
  - `toMessageDto(m)`·`messageInclude` (`src/serializers.ts`) — Task 5·6이 재사용
  - `@deuce/shared`: `MessageDtoSchema`, `MessageDto`

- [ ] **Step 1: shared 스키마** — `packages/shared/src/message.ts`

```ts
import { z } from 'zod'
import { UserDtoSchema } from './user.js'

export const MessageDtoSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  author: UserDtoSchema,
  body: z.string(),
  deleted: z.boolean(),
  replyTo: z
    .object({ id: z.string(), body: z.string(), authorName: z.string(), deleted: z.boolean() })
    .nullable(),
  reactions: z.array(z.object({ emoji: z.string(), userIds: z.array(z.string()) })),
  mentions: z.array(z.string()),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  pinnedAt: z.string().nullable(),
})

export type MessageDto = z.infer<typeof MessageDtoSchema>
```

`packages/shared/src/index.ts`에 추가:

```ts
export { MessageDtoSchema, type MessageDto } from './message.js'
```

- [ ] **Step 2: 실패하는 테스트 작성** — `apps/server/test/messages.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { MessageDtoSchema, type UserDto } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'

interface Ctx extends TestApp {
  aCookie: string
  bCookie: string
  convoId: string
}

async function setupDm(): Promise<Ctx> {
  const t = await makeTestApp()
  const aCookie = await t.loginAs('a@goldenlabs.dev', 'A')
  const bCookie = await t.loginAs('b@goldenlabs.dev', 'B')
  const users = (
    await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
  ).json() as UserDto[]
  const b = users.find((u) => u.email === 'b@goldenlabs.dev')!
  const convo = await t.app.inject({
    method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
    payload: { type: 'dm', otherUserId: b.id },
  })
  return { ...t, aCookie, bCookie, convoId: (convo.json() as { id: string }).id }
}

describe('messages api', () => {
  beforeEach(resetDb)

  it('posts a message and a quote reply with mention', async () => {
    const { app, aCookie, bCookie, convoId } = await setupDm()
    const users = (
      await app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
    ).json() as UserDto[]
    const a = users.find((u) => u.email === 'a@goldenlabs.dev')!

    const first = await app.inject({
      method: 'POST', url: `/api/conversations/${convoId}/messages`, headers: { cookie: aCookie },
      payload: { body: '안녕하세요' },
    })
    expect(first.statusCode).toBe(201)
    const msg = MessageDtoSchema.parse(first.json())

    const reply = await app.inject({
      method: 'POST', url: `/api/conversations/${convoId}/messages`, headers: { cookie: bCookie },
      payload: { body: '@A 답장입니다', replyToId: msg.id, mentions: [a.id] },
    })
    expect(reply.statusCode).toBe(201)
    const dto = MessageDtoSchema.parse(reply.json())
    expect(dto.replyTo?.id).toBe(msg.id)
    expect(dto.replyTo?.authorName).toBe('A')
    expect(dto.mentions).toEqual([a.id])
  })

  it('rejects non-member, bad replyTo, and non-member mention', async () => {
    const { app, convoId, loginAs, aCookie } = await setupDm()
    const cCookie = await loginAs('c@goldenlabs.dev', 'C')
    const outsider = await app.inject({
      method: 'POST', url: `/api/conversations/${convoId}/messages`, headers: { cookie: cCookie },
      payload: { body: '침입' },
    })
    expect(outsider.statusCode).toBe(403)

    const badReply = await app.inject({
      method: 'POST', url: `/api/conversations/${convoId}/messages`, headers: { cookie: aCookie },
      payload: { body: 'x', replyToId: '00000000-0000-0000-0000-000000000000' },
    })
    expect(badReply.statusCode).toBe(400)

    const users = (
      await app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
    ).json() as UserDto[]
    const c = users.find((u) => u.email === 'c@goldenlabs.dev')!
    const badMention = await app.inject({
      method: 'POST', url: `/api/conversations/${convoId}/messages`, headers: { cookie: aCookie },
      payload: { body: 'x', mentions: [c.id] },
    })
    expect(badMention.statusCode).toBe(400)
  })

  it('paginates messages newest-first with cursor', async () => {
    const { app, aCookie, convoId } = await setupDm()
    for (const body of ['하나', '둘', '셋']) {
      const res = await app.inject({
        method: 'POST', url: `/api/conversations/${convoId}/messages`, headers: { cookie: aCookie },
        payload: { body },
      })
      expect(res.statusCode).toBe(201)
    }
    const page1 = await app.inject({
      method: 'GET', url: `/api/conversations/${convoId}/messages?limit=2`, headers: { cookie: aCookie },
    })
    const p1 = page1.json() as { items: Array<{ body: string; id: string }>; nextCursor: string | null }
    expect(p1.items.map((m) => m.body)).toEqual(['셋', '둘'])
    expect(p1.nextCursor).toBe(p1.items[1]!.id)

    const page2 = await app.inject({
      method: 'GET',
      url: `/api/conversations/${convoId}/messages?limit=2&cursor=${p1.nextCursor}`,
      headers: { cookie: aCookie },
    })
    const p2 = page2.json() as { items: Array<{ body: string }>; nextCursor: string | null }
    expect(p2.items.map((m) => m.body)).toEqual(['하나'])
    expect(p2.nextCursor).toBeNull()
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `cd apps/server && pnpm vitest run test/messages.test.ts`
Expected: FAIL — 메시지 라우트 404

- [ ] **Step 4: 구현**

`apps/server/src/serializers.ts`에 추가:

```ts
import type { Prisma } from '@prisma/client'
import type { MessageDto } from '@deuce/shared'
```

```ts
export const messageInclude = {
  author: true,
  replyTo: { include: { author: true } },
  reactions: true,
  mentions: true,
} as const

type MessageWithRels = Prisma.MessageGetPayload<{ include: typeof messageInclude }>

export function toMessageDto(m: MessageWithRels): MessageDto {
  const grouped = new Map<string, string[]>()
  for (const r of m.reactions) grouped.set(r.emoji, [...(grouped.get(r.emoji) ?? []), r.userId])
  return {
    id: m.id,
    conversationId: m.conversationId,
    author: toUserDto(m.author),
    body: m.deletedAt ? '' : m.body,
    deleted: m.deletedAt !== null,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          body: m.replyTo.deletedAt ? '' : m.replyTo.body,
          authorName: m.replyTo.author.name,
          deleted: m.replyTo.deletedAt !== null,
        }
      : null,
    reactions: [...grouped.entries()].map(([emoji, userIds]) => ({ emoji, userIds })),
    mentions: m.mentions.map((x) => x.mentionedUserId),
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    pinnedAt: m.pinnedAt?.toISOString() ?? null,
  }
}
```

`apps/server/src/routes/messages.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { isMember } from '../domain/conversations.js'
import { messageInclude, toMessageDto } from '../serializers.js'

const PostSchema = z.object({
  body: z.string().min(1).max(4000),
  replyToId: z.string().optional(),
  mentions: z.array(z.string()).max(20).default([]),
})

const ListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const messageRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.post('/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string }
    const me = req.currentUser.id
    if (!(await isMember(id, me))) return reply.code(403).send({ error: 'not a member' })
    const parsed = PostSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' })
    const { body, replyToId, mentions } = parsed.data
    if (replyToId) {
      const target = await prisma.message.findUnique({ where: { id: replyToId } })
      if (!target || target.conversationId !== id)
        return reply.code(400).send({ error: 'invalid replyToId' })
    }
    for (const uid of new Set(mentions)) {
      if (!(await isMember(id, uid)))
        return reply.code(400).send({ error: 'mention must be a member' })
    }
    const created = await prisma.message.create({
      data: {
        conversationId: id,
        authorId: me,
        body,
        replyToId: replyToId ?? null,
        mentions: { create: [...new Set(mentions)].map((mentionedUserId) => ({ mentionedUserId })) },
      },
      include: messageInclude,
    })
    return reply.code(201).send(toMessageDto(created))
  })

  app.get('/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string }
    const me = req.currentUser.id
    if (!(await isMember(id, me))) return reply.code(403).send({ error: 'not a member' })
    const q = ListQuerySchema.safeParse(req.query)
    if (!q.success) return reply.code(400).send({ error: 'invalid query' })
    let cursorDate: Date | null = null
    if (q.data.cursor) {
      const c = await prisma.message.findUnique({ where: { id: q.data.cursor } })
      if (!c || c.conversationId !== id) return reply.code(400).send({ error: 'invalid cursor' })
      cursorDate = c.createdAt
    }
    const items = await prisma.message.findMany({
      where: { conversationId: id, ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: q.data.limit,
      include: messageInclude,
    })
    return {
      items: items.map(toMessageDto),
      nextCursor: items.length === q.data.limit ? items[items.length - 1]!.id : null,
    }
  })
}
```

`apps/server/src/app.ts`에 등록 추가:

```ts
import { messageRoutes } from './routes/messages.js'
```

```ts
  await app.register(messageRoutes, { prefix: '/api' })
```

- [ ] **Step 5: 전체 테스트·타입체크 통과 확인**

Run: `cd apps/server && pnpm test && pnpm typecheck && cd ../../packages/shared && pnpm typecheck`
Expected: 전부 PASS

- [ ] **Step 6: Commit**

```bash
git add apps/server/src apps/server/test packages/shared/src
git commit -m "feat: add message post and cursor-paginated list with quotes and mentions"
```

---

### Task 4: 대화방 관리(이름·멤버·나가기·음소거) + 읽음 커서

**Files:**
- Modify: `apps/server/src/routes/conversations.ts`
- Test: `apps/server/test/conversation-admin.test.ts`

**Interfaces:**
- Consumes: `summarizeConversation`·`isMember`, 메시지 API (Task 3, 읽음 테스트용)
- Produces:
  - `PATCH /api/conversations/:id` body `{ title }` — GROUP만(DM이면 400), 멤버만(403) → 200 summary
  - `POST /api/conversations/:id/members` body `{ userIds }` — GROUP만, 멤버만 → 200 summary (이미 멤버인 id는 무시)
  - `DELETE /api/conversations/:id/members/me` — 나가기(본인만) → 204
  - `PUT /api/conversations/:id/mute` → 204 / `DELETE /api/conversations/:id/mute` → 204
  - `PUT /api/conversations/:id/read` body `{ messageId }` → 204 — greatest-upsert(과거로 되감기 무시)

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/server/test/conversation-admin.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { UserDto, ConversationSummary } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'

interface Ctx extends TestApp {
  aCookie: string
  bCookie: string
  groupId: string
  ids: Record<'a' | 'b' | 'c', string>
}

async function setupGroup(): Promise<Ctx> {
  const t = await makeTestApp()
  const aCookie = await t.loginAs('a@goldenlabs.dev', 'A')
  const bCookie = await t.loginAs('b@goldenlabs.dev', 'B')
  await t.loginAs('c@goldenlabs.dev', 'C')
  const users = (
    await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
  ).json() as UserDto[]
  const id = (email: string) => users.find((u) => u.email === email)!.id
  const ids = { a: id('a@goldenlabs.dev'), b: id('b@goldenlabs.dev'), c: id('c@goldenlabs.dev') }
  const convo = await t.app.inject({
    method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
    payload: { type: 'group', title: '테스트방', memberIds: [ids.b] },
  })
  return { ...t, aCookie, bCookie, groupId: (convo.json() as { id: string }).id, ids }
}

async function mySummary(t: Ctx, cookie: string): Promise<ConversationSummary> {
  const list = await t.app.inject({ method: 'GET', url: '/api/conversations', headers: { cookie } })
  return (list.json() as ConversationSummary[])[0]!
}

describe('conversation admin & read cursor', () => {
  beforeEach(resetDb)

  it('renames a group, adds a member, and lets a member leave', async () => {
    const t = await setupGroup()
    const rename = await t.app.inject({
      method: 'PATCH', url: `/api/conversations/${t.groupId}`, headers: { cookie: t.aCookie },
      payload: { title: '새 이름' },
    })
    expect(rename.statusCode).toBe(200)
    expect((rename.json() as ConversationSummary).displayName).toBe('새 이름')

    const add = await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.groupId}/members`, headers: { cookie: t.aCookie },
      payload: { userIds: [t.ids.c] },
    })
    expect(add.statusCode).toBe(200)
    expect((add.json() as ConversationSummary).members).toHaveLength(3)

    const leave = await t.app.inject({
      method: 'DELETE', url: `/api/conversations/${t.groupId}/members/me`, headers: { cookie: t.bCookie },
    })
    expect(leave.statusCode).toBe(204)
    const afterLeave = await t.app.inject({
      method: 'GET', url: '/api/conversations', headers: { cookie: t.bCookie },
    })
    expect(afterLeave.json()).toEqual([])
  })

  it('mutes and unmutes', async () => {
    const t = await setupGroup()
    const mute = await t.app.inject({
      method: 'PUT', url: `/api/conversations/${t.groupId}/mute`, headers: { cookie: t.aCookie },
    })
    expect(mute.statusCode).toBe(204)
    expect((await mySummary(t, t.aCookie)).mutedAt).not.toBeNull()
    const unmute = await t.app.inject({
      method: 'DELETE', url: `/api/conversations/${t.groupId}/mute`, headers: { cookie: t.aCookie },
    })
    expect(unmute.statusCode).toBe(204)
    expect((await mySummary(t, t.aCookie)).mutedAt).toBeNull()
  })

  it('advances the read cursor and never rewinds it', async () => {
    const t = await setupGroup()
    const send = async (body: string) =>
      (
        await t.app.inject({
          method: 'POST', url: `/api/conversations/${t.groupId}/messages`,
          headers: { cookie: t.bCookie }, payload: { body },
        })
      ).json() as { id: string }
    const m1 = await send('하나')
    const m2 = await send('둘')

    expect((await mySummary(t, t.aCookie)).unreadCount).toBe(2)

    const read2 = await t.app.inject({
      method: 'PUT', url: `/api/conversations/${t.groupId}/read`, headers: { cookie: t.aCookie },
      payload: { messageId: m2.id },
    })
    expect(read2.statusCode).toBe(204)
    expect((await mySummary(t, t.aCookie)).unreadCount).toBe(0)

    const rewind = await t.app.inject({
      method: 'PUT', url: `/api/conversations/${t.groupId}/read`, headers: { cookie: t.aCookie },
      payload: { messageId: m1.id },
    })
    expect(rewind.statusCode).toBe(204)
    expect((await mySummary(t, t.aCookie)).unreadCount).toBe(0)
  })

  it('rejects rename of a dm and by a non-member', async () => {
    const t = await setupGroup()
    const cCookie = await t.loginAs('c@goldenlabs.dev', 'C')
    const byOutsider = await t.app.inject({
      method: 'PATCH', url: `/api/conversations/${t.groupId}`, headers: { cookie: cCookie },
      payload: { title: 'x' },
    })
    expect(byOutsider.statusCode).toBe(403)

    const dm = await t.app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: t.aCookie },
      payload: { type: 'dm', otherUserId: t.ids.b },
    })
    const dmId = (dm.json() as { id: string }).id
    const renameDm = await t.app.inject({
      method: 'PATCH', url: `/api/conversations/${dmId}`, headers: { cookie: t.aCookie },
      payload: { title: 'x' },
    })
    expect(renameDm.statusCode).toBe(400)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/server && pnpm vitest run test/conversation-admin.test.ts`
Expected: FAIL — PATCH·members·mute·read 라우트 404

- [ ] **Step 3: 구현** — `apps/server/src/routes/conversations.ts`의 플러그인 함수 안에 라우트 추가

```ts
  app.patch('/conversations/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const me = req.currentUser.id
    if (!(await isMember(id, me))) return reply.code(403).send({ error: 'not a member' })
    const convo = await prisma.conversation.findUniqueOrThrow({ where: { id } })
    if (convo.type !== 'GROUP') return reply.code(400).send({ error: 'group only' })
    const parsed = z.object({ title: z.string().min(1).max(100) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' })
    await prisma.conversation.update({ where: { id }, data: { title: parsed.data.title } })
    return reply.code(200).send(await summarizeConversation(id, me))
  })

  app.post('/conversations/:id/members', async (req, reply) => {
    const { id } = req.params as { id: string }
    const me = req.currentUser.id
    if (!(await isMember(id, me))) return reply.code(403).send({ error: 'not a member' })
    const convo = await prisma.conversation.findUniqueOrThrow({ where: { id } })
    if (convo.type !== 'GROUP') return reply.code(400).send({ error: 'group only' })
    const parsed = z.object({ userIds: z.array(z.string()).min(1).max(50) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' })
    const userIds = [...new Set(parsed.data.userIds)]
    const found = await prisma.user.count({ where: { id: { in: userIds } } })
    if (found !== userIds.length) return reply.code(404).send({ error: 'user not found' })
    await prisma.conversationMember.createMany({
      data: userIds.map((userId) => ({ conversationId: id, userId })),
      skipDuplicates: true,
    })
    return reply.code(200).send(await summarizeConversation(id, me))
  })

  app.delete('/conversations/:id/members/me', async (req, reply) => {
    const { id } = req.params as { id: string }
    const me = req.currentUser.id
    if (!(await isMember(id, me))) return reply.code(403).send({ error: 'not a member' })
    await prisma.conversationMember.delete({
      where: { conversationId_userId: { conversationId: id, userId: me } },
    })
    return reply.code(204).send()
  })

  app.put('/conversations/:id/mute', async (req, reply) => {
    const { id } = req.params as { id: string }
    const me = req.currentUser.id
    if (!(await isMember(id, me))) return reply.code(403).send({ error: 'not a member' })
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: me } },
      data: { mutedAt: new Date() },
    })
    return reply.code(204).send()
  })

  app.delete('/conversations/:id/mute', async (req, reply) => {
    const { id } = req.params as { id: string }
    const me = req.currentUser.id
    if (!(await isMember(id, me))) return reply.code(403).send({ error: 'not a member' })
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId: id, userId: me } },
      data: { mutedAt: null },
    })
    return reply.code(204).send()
  })

  app.put('/conversations/:id/read', async (req, reply) => {
    const { id } = req.params as { id: string }
    const me = req.currentUser.id
    if (!(await isMember(id, me))) return reply.code(403).send({ error: 'not a member' })
    const parsed = z.object({ messageId: z.string() }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' })
    const msg = await prisma.message.findUnique({ where: { id: parsed.data.messageId } })
    if (!msg || msg.conversationId !== id) return reply.code(404).send({ error: 'message not found' })
    const current = await prisma.readState.findUnique({
      where: { userId_conversationId: { userId: me, conversationId: id } },
    })
    if (current?.lastReadMessageId) {
      const cur = await prisma.message.findUnique({ where: { id: current.lastReadMessageId } })
      if (cur && cur.createdAt > msg.createdAt) return reply.code(204).send()
    }
    await prisma.readState.upsert({
      where: { userId_conversationId: { userId: me, conversationId: id } },
      create: { userId: me, conversationId: id, lastReadMessageId: msg.id },
      update: { lastReadMessageId: msg.id },
    })
    return reply.code(204).send()
  })
```

- [ ] **Step 4: 전체 테스트·타입체크 통과 확인**

Run: `cd apps/server && pnpm test && pnpm typecheck`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src apps/server/test
git commit -m "feat: add conversation admin routes and monotonic read cursor"
```

---

### Task 5: 메시지 수정·삭제·반응·고정 + 대화방 상세

**Files:**
- Modify: `apps/server/src/routes/messages.ts`, `apps/server/src/routes/conversations.ts` (GET :id 상세)
- Test: `apps/server/test/message-actions.test.ts`

**Interfaces:**
- Consumes: `toMessageDto`·`messageInclude`·`isMember`·`summarizeConversation`
- Produces:
  - `PATCH /api/messages/:id` body `{ body }` — 작성자만(403) → 200 MessageDto(editedAt 설정). 삭제된 메시지는 400
  - `DELETE /api/messages/:id` — 작성자만 → 204 (soft delete)
  - `PUT /api/messages/:id/reactions` body `{ emoji }` (1~32자) — 멤버만 → 204 (중복 무시)
  - `DELETE /api/messages/:id/reactions/:emoji` → 204
  - `PUT /api/messages/:id/pin` / `DELETE /api/messages/:id/pin` — 멤버 누구나 → 204
  - `GET /api/conversations/:id` → 200 `{ ...ConversationSummary, pinnedMessage: MessageDto|null }` (최신 핀)

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/server/test/message-actions.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { MessageDtoSchema, type UserDto } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'

interface Ctx extends TestApp {
  aCookie: string
  bCookie: string
  convoId: string
  msgId: string
}

async function setup(): Promise<Ctx> {
  const t = await makeTestApp()
  const aCookie = await t.loginAs('a@goldenlabs.dev', 'A')
  const bCookie = await t.loginAs('b@goldenlabs.dev', 'B')
  const users = (
    await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
  ).json() as UserDto[]
  const b = users.find((u) => u.email === 'b@goldenlabs.dev')!
  const convo = await t.app.inject({
    method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
    payload: { type: 'dm', otherUserId: b.id },
  })
  const convoId = (convo.json() as { id: string }).id
  const msg = await t.app.inject({
    method: 'POST', url: `/api/conversations/${convoId}/messages`, headers: { cookie: aCookie },
    payload: { body: '원본' },
  })
  return { ...t, aCookie, bCookie, convoId, msgId: (msg.json() as { id: string }).id }
}

describe('message actions', () => {
  beforeEach(resetDb)

  it('edits own message; others get 403', async () => {
    const t = await setup()
    const forbidden = await t.app.inject({
      method: 'PATCH', url: `/api/messages/${t.msgId}`, headers: { cookie: t.bCookie },
      payload: { body: '해킹' },
    })
    expect(forbidden.statusCode).toBe(403)
    const ok = await t.app.inject({
      method: 'PATCH', url: `/api/messages/${t.msgId}`, headers: { cookie: t.aCookie },
      payload: { body: '수정됨' },
    })
    expect(ok.statusCode).toBe(200)
    const dto = MessageDtoSchema.parse(ok.json())
    expect(dto.body).toBe('수정됨')
    expect(dto.editedAt).not.toBeNull()
  })

  it('soft-deletes and masks the body in lists', async () => {
    const t = await setup()
    const del = await t.app.inject({
      method: 'DELETE', url: `/api/messages/${t.msgId}`, headers: { cookie: t.aCookie },
    })
    expect(del.statusCode).toBe(204)
    const list = await t.app.inject({
      method: 'GET', url: `/api/conversations/${t.convoId}/messages`, headers: { cookie: t.aCookie },
    })
    const items = (list.json() as { items: Array<{ deleted: boolean; body: string }> }).items
    expect(items[0]).toMatchObject({ deleted: true, body: '' })
  })

  it('adds and removes reactions idempotently', async () => {
    const t = await setup()
    for (let i = 0; i < 2; i += 1) {
      const res = await t.app.inject({
        method: 'PUT', url: `/api/messages/${t.msgId}/reactions`, headers: { cookie: t.bCookie },
        payload: { emoji: '👍' },
      })
      expect(res.statusCode).toBe(204)
    }
    const list = await t.app.inject({
      method: 'GET', url: `/api/conversations/${t.convoId}/messages`, headers: { cookie: t.aCookie },
    })
    const msg = (list.json() as { items: Array<{ reactions: Array<{ emoji: string; userIds: string[] }> }> }).items[0]!
    expect(msg.reactions).toHaveLength(1)
    expect(msg.reactions[0]!.userIds).toHaveLength(1)

    const remove = await t.app.inject({
      method: 'DELETE',
      url: `/api/messages/${t.msgId}/reactions/${encodeURIComponent('👍')}`,
      headers: { cookie: t.bCookie },
    })
    expect(remove.statusCode).toBe(204)
  })

  it('pins a message and exposes it on conversation detail', async () => {
    const t = await setup()
    const pin = await t.app.inject({
      method: 'PUT', url: `/api/messages/${t.msgId}/pin`, headers: { cookie: t.bCookie },
    })
    expect(pin.statusCode).toBe(204)
    const detail = await t.app.inject({
      method: 'GET', url: `/api/conversations/${t.convoId}`, headers: { cookie: t.aCookie },
    })
    expect(detail.statusCode).toBe(200)
    const body = detail.json() as { pinnedMessage: { id: string } | null }
    expect(body.pinnedMessage?.id).toBe(t.msgId)

    const unpin = await t.app.inject({
      method: 'DELETE', url: `/api/messages/${t.msgId}/pin`, headers: { cookie: t.aCookie },
    })
    expect(unpin.statusCode).toBe(204)
    const after = await t.app.inject({
      method: 'GET', url: `/api/conversations/${t.convoId}`, headers: { cookie: t.aCookie },
    })
    expect((after.json() as { pinnedMessage: unknown }).pinnedMessage).toBeNull()
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/server && pnpm vitest run test/message-actions.test.ts`
Expected: FAIL — PATCH/DELETE/reactions/pin 라우트 404

- [ ] **Step 3: 구현**

`apps/server/src/routes/messages.ts`의 플러그인 함수 안에 추가 (파일 상단에 헬퍼 추가):

```ts
async function memberMessage(messageId: string, userId: string) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } })
  if (!msg) return null
  return (await isMember(msg.conversationId, userId)) ? msg : null
}
```

```ts
  app.patch('/messages/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const msg = await memberMessage(id, req.currentUser.id)
    if (!msg) return reply.code(404).send({ error: 'message not found' })
    if (msg.authorId !== req.currentUser.id) return reply.code(403).send({ error: 'author only' })
    if (msg.deletedAt) return reply.code(400).send({ error: 'message deleted' })
    const parsed = z.object({ body: z.string().min(1).max(4000) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' })
    const updated = await prisma.message.update({
      where: { id },
      data: { body: parsed.data.body, editedAt: new Date() },
      include: messageInclude,
    })
    return reply.code(200).send(toMessageDto(updated))
  })

  app.delete('/messages/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const msg = await memberMessage(id, req.currentUser.id)
    if (!msg) return reply.code(404).send({ error: 'message not found' })
    if (msg.authorId !== req.currentUser.id) return reply.code(403).send({ error: 'author only' })
    await prisma.message.update({ where: { id }, data: { deletedAt: new Date() } })
    return reply.code(204).send()
  })

  app.put('/messages/:id/reactions', async (req, reply) => {
    const { id } = req.params as { id: string }
    const msg = await memberMessage(id, req.currentUser.id)
    if (!msg) return reply.code(404).send({ error: 'message not found' })
    const parsed = z.object({ emoji: z.string().min(1).max(32) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' })
    await prisma.reaction.upsert({
      where: {
        messageId_userId_emoji: {
          messageId: id, userId: req.currentUser.id, emoji: parsed.data.emoji,
        },
      },
      create: { messageId: id, userId: req.currentUser.id, emoji: parsed.data.emoji },
      update: {},
    })
    return reply.code(204).send()
  })

  app.delete('/messages/:id/reactions/:emoji', async (req, reply) => {
    const { id, emoji } = req.params as { id: string; emoji: string }
    const msg = await memberMessage(id, req.currentUser.id)
    if (!msg) return reply.code(404).send({ error: 'message not found' })
    await prisma.reaction.deleteMany({
      where: { messageId: id, userId: req.currentUser.id, emoji },
    })
    return reply.code(204).send()
  })

  app.put('/messages/:id/pin', async (req, reply) => {
    const { id } = req.params as { id: string }
    const msg = await memberMessage(id, req.currentUser.id)
    if (!msg) return reply.code(404).send({ error: 'message not found' })
    await prisma.message.update({ where: { id }, data: { pinnedAt: new Date() } })
    return reply.code(204).send()
  })

  app.delete('/messages/:id/pin', async (req, reply) => {
    const { id } = req.params as { id: string }
    const msg = await memberMessage(id, req.currentUser.id)
    if (!msg) return reply.code(404).send({ error: 'message not found' })
    await prisma.message.update({ where: { id }, data: { pinnedAt: null } })
    return reply.code(204).send()
  })
```

`apps/server/src/routes/conversations.ts`에 상세 라우트 추가 (import에 `messageInclude, toMessageDto` from `'../serializers.js'` 추가):

```ts
  app.get('/conversations/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const me = req.currentUser.id
    if (!(await isMember(id, me))) return reply.code(403).send({ error: 'not a member' })
    const pinned = await prisma.message.findFirst({
      where: { conversationId: id, pinnedAt: { not: null }, deletedAt: null },
      orderBy: { pinnedAt: 'desc' },
      include: messageInclude,
    })
    const summary = await summarizeConversation(id, me)
    return { ...summary, pinnedMessage: pinned ? toMessageDto(pinned) : null }
  })
```

(주의: `isMember`는 이미 import되어 있다.)

- [ ] **Step 4: 전체 테스트·타입체크 통과 확인**

Run: `cd apps/server && pnpm test && pnpm typecheck`
Expected: 전부 PASS

- [ ] **Step 5: Commit**

```bash
git add apps/server/src apps/server/test
git commit -m "feat: add message edit, soft delete, reactions, pin and conversation detail"
```

---

### Task 6: 검색(pg_trgm) + 활동 피드 + 인덱스 마이그레이션

**Files:**
- Modify: `apps/server/prisma/schema.prisma` (pg_trgm extension·Gin 인덱스·ConversationMember userId 인덱스), `apps/server/src/app.ts` (등록), `packages/shared/src/index.ts`
- Create: `apps/server/src/routes/search.ts`, `apps/server/src/routes/activity.ts`, `packages/shared/src/activity.ts`, 새 마이그레이션(`prisma migrate dev --name search_indexes`)
- Test: `apps/server/test/search-activity.test.ts`

**Interfaces:**
- Consumes: 메시지·반응·멘션 API (Task 3·5), `toUserDto`
- Produces:
  - `GET /api/search?q=` (2~100자, 미달 400) → `SearchResult[]` — 내 대화방의 삭제 안 된 메시지, ILIKE 부분일치(한국어 대응), 최신순 20개
  - `GET /api/activity` → `ActivityItem[]` — 나를 멘션한 것 + 내 메시지에 달린 반응, 최신순 30개
  - `@deuce/shared`: `SearchResultSchema`, `ActivityItemSchema`

- [ ] **Step 1: 스키마에 확장·인덱스 추가** — `apps/server/prisma/schema.prisma`

generator 블록을 다음으로 교체:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}
```

datasource 블록을 다음으로 교체:

```prisma
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pg_trgm]
}
```

Message 모델의 `@@index([conversationId, createdAt])` 아래에 추가:

```prisma
  @@index([body(ops: raw("gin_trgm_ops"))], type: Gin)
```

ConversationMember 모델의 `@@id` 아래에 추가:

```prisma
  @@index([userId])
```

- [ ] **Step 2: 마이그레이션 생성·적용 (양쪽 DB)**

Run: `cd apps/server && pnpm db:migrate --name search_indexes && pnpm db:migrate:test`
Expected: 마이그레이션에 `CREATE EXTENSION IF NOT EXISTS "pg_trgm"`, GIN 인덱스, userId 인덱스 포함. 두 DB 적용 성공.
(만약 Prisma 6.19.3에서 `ops: raw(...)` 문법이 스키마 검증에 실패하면: Gin 인덱스 줄만 스키마에서 빼고, `pnpm db:migrate --create-only --name search_indexes`로 빈 마이그레이션을 만들어 `CREATE INDEX "Message_body_trgm_idx" ON "Message" USING GIN ("body" gin_trgm_ops);`를 직접 넣은 뒤 적용한다. 이 경우 보고서에 어느 경로를 탔는지 명시한다.)

- [ ] **Step 3: shared 스키마** — `packages/shared/src/activity.ts`

```ts
import { z } from 'zod'
import { UserDtoSchema } from './user.js'

export const SearchResultSchema = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  conversationType: z.enum(['DM', 'GROUP']),
  conversationTitle: z.string().nullable(),
  body: z.string(),
  authorName: z.string(),
  createdAt: z.string(),
})
export type SearchResult = z.infer<typeof SearchResultSchema>

export const ActivityItemSchema = z.object({
  kind: z.enum(['mention', 'reaction']),
  messageId: z.string(),
  conversationId: z.string(),
  body: z.string(),
  actor: UserDtoSchema,
  emoji: z.string().nullable(),
  createdAt: z.string(),
})
export type ActivityItem = z.infer<typeof ActivityItemSchema>
```

`packages/shared/src/index.ts`에 추가:

```ts
export { SearchResultSchema, type SearchResult, ActivityItemSchema, type ActivityItem } from './activity.js'
```

- [ ] **Step 4: 실패하는 테스트 작성** — `apps/server/test/search-activity.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { ActivityItemSchema, SearchResultSchema, type UserDto } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'

interface Ctx extends TestApp {
  aCookie: string
  bCookie: string
  convoId: string
  aId: string
}

async function setup(): Promise<Ctx> {
  const t = await makeTestApp()
  const aCookie = await t.loginAs('a@goldenlabs.dev', 'A')
  const bCookie = await t.loginAs('b@goldenlabs.dev', 'B')
  const users = (
    await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
  ).json() as UserDto[]
  const a = users.find((u) => u.email === 'a@goldenlabs.dev')!
  const b = users.find((u) => u.email === 'b@goldenlabs.dev')!
  const convo = await t.app.inject({
    method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
    payload: { type: 'dm', otherUserId: b.id },
  })
  return { ...t, aCookie, bCookie, convoId: (convo.json() as { id: string }).id, aId: a.id }
}

describe('search & activity', () => {
  beforeEach(resetDb)

  it('finds korean substrings only in my conversations', async () => {
    const t = await setup()
    await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.convoId}/messages`, headers: { cookie: t.aCookie },
      payload: { body: '훈련 절차 정리했습니다' },
    })
    const hit = await t.app.inject({
      method: 'GET', url: `/api/search?q=${encodeURIComponent('절차')}`, headers: { cookie: t.aCookie },
    })
    expect(hit.statusCode).toBe(200)
    const results = (hit.json() as unknown[]).map((x) => SearchResultSchema.parse(x))
    expect(results).toHaveLength(1)
    expect(results[0]!.body).toContain('절차')

    // 대화방 밖 사용자에게는 보이지 않는다
    const cCookie = await t.loginAs('c@goldenlabs.dev', 'C')
    const miss = await t.app.inject({
      method: 'GET', url: `/api/search?q=${encodeURIComponent('절차')}`, headers: { cookie: cCookie },
    })
    expect(miss.json()).toEqual([])

    const tooShort = await t.app.inject({
      method: 'GET', url: '/api/search?q=절', headers: { cookie: t.aCookie },
    })
    expect(tooShort.statusCode).toBe(400)
  })

  it('escapes ILIKE wildcards in the query', async () => {
    const t = await setup()
    await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.convoId}/messages`, headers: { cookie: t.aCookie },
      payload: { body: '100% 완료' },
    })
    const literal = await t.app.inject({
      method: 'GET', url: `/api/search?q=${encodeURIComponent('0%')}`, headers: { cookie: t.aCookie },
    })
    expect((literal.json() as unknown[]).length).toBe(1)
    const wildcardAbuse = await t.app.inject({
      method: 'GET', url: `/api/search?q=${encodeURIComponent('%완')}`, headers: { cookie: t.aCookie },
    })
    expect((wildcardAbuse.json() as unknown[]).length).toBe(0)
  })

  it('lists mentions of me and reactions on my messages', async () => {
    const t = await setup()
    const mine = await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.convoId}/messages`, headers: { cookie: t.aCookie },
      payload: { body: '내 메시지' },
    })
    const myMsgId = (mine.json() as { id: string }).id
    await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.convoId}/messages`, headers: { cookie: t.bCookie },
      payload: { body: '@A 확인 부탁', mentions: [t.aId] },
    })
    await t.app.inject({
      method: 'PUT', url: `/api/messages/${myMsgId}/reactions`, headers: { cookie: t.bCookie },
      payload: { emoji: '👍' },
    })
    const res = await t.app.inject({
      method: 'GET', url: '/api/activity', headers: { cookie: t.aCookie },
    })
    expect(res.statusCode).toBe(200)
    const items = (res.json() as unknown[]).map((x) => ActivityItemSchema.parse(x))
    expect(items).toHaveLength(2)
    const kinds = items.map((i) => i.kind).sort()
    expect(kinds).toEqual(['mention', 'reaction'])
    for (const item of items) expect(item.actor.email).toBe('b@goldenlabs.dev')
  })
})
```

- [ ] **Step 5: 실패 확인**

Run: `cd apps/server && pnpm vitest run test/search-activity.test.ts`
Expected: FAIL — /api/search·/api/activity 404

- [ ] **Step 6: 구현**

`apps/server/src/routes/search.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import type { SearchResult } from '@deuce/shared'
import { prisma } from '../db.js'

const QuerySchema = z.object({ q: z.string().min(2).max(100) })

interface Row {
  messageId: string
  conversationId: string
  conversationType: 'DM' | 'GROUP'
  conversationTitle: string | null
  body: string
  authorName: string
  createdAt: Date
}

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.get('/search', async (req, reply) => {
    const parsed = QuerySchema.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid query' })
    const me = req.currentUser.id
    // %·_·\ 는 리터럴로 취급 (ILIKE 와일드카드 주입 방지)
    const escaped = parsed.data.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)
    const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT m.id AS "messageId",
             m."conversationId",
             c.type::text AS "conversationType",
             c.title AS "conversationTitle",
             m.body,
             u.name AS "authorName",
             m."createdAt"
      FROM "Message" m
      JOIN "User" u ON u.id = m."authorId"
      JOIN "Conversation" c ON c.id = m."conversationId"
      JOIN "ConversationMember" cm
        ON cm."conversationId" = m."conversationId" AND cm."userId" = ${me}
      WHERE m."deletedAt" IS NULL
        AND m.body ILIKE ${'%' + escaped + '%'} ESCAPE '\\'
      ORDER BY m."createdAt" DESC
      LIMIT 20
    `)
    const results: SearchResult[] = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
    return results
  })
}
```

`apps/server/src/routes/activity.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify'
import type { ActivityItem } from '@deuce/shared'
import { prisma } from '../db.js'
import { toUserDto } from '../serializers.js'

export const activityRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.get('/activity', async (req) => {
    const me = req.currentUser.id
    const mentions = await prisma.mention.findMany({
      where: { mentionedUserId: me, message: { deletedAt: null, authorId: { not: me } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { message: { include: { author: true } } },
    })
    const reactions = await prisma.reaction.findMany({
      where: { userId: { not: me }, message: { authorId: me, deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { message: true, user: true },
    })
    const items: ActivityItem[] = [
      ...mentions.map((m) => ({
        kind: 'mention' as const,
        messageId: m.messageId,
        conversationId: m.message.conversationId,
        body: m.message.body,
        actor: toUserDto(m.message.author),
        emoji: null,
        createdAt: m.createdAt.toISOString(),
      })),
      ...reactions.map((r) => ({
        kind: 'reaction' as const,
        messageId: r.messageId,
        conversationId: r.message.conversationId,
        body: r.message.body,
        actor: toUserDto(r.user),
        emoji: r.emoji,
        createdAt: r.createdAt.toISOString(),
      })),
    ]
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return items.slice(0, 30)
  })
}
```

`apps/server/src/app.ts`에 등록 추가:

```ts
import { searchRoutes } from './routes/search.js'
import { activityRoutes } from './routes/activity.js'
```

```ts
  await app.register(searchRoutes, { prefix: '/api' })
  await app.register(activityRoutes, { prefix: '/api' })
```

- [ ] **Step 7: 전체 테스트·양쪽 타입체크 통과 확인**

Run: `cd apps/server && pnpm test && pnpm typecheck && cd ../../packages/shared && pnpm typecheck`
Expected: 전부 PASS (계획 ① 테스트 포함)

- [ ] **Step 8: Commit**

```bash
git add apps/server/prisma apps/server/src apps/server/test packages/shared/src
git commit -m "feat: add trigram search and activity feed with new db indexes"
```

---

## Self-Review 결과

- **스펙 커버리지**: §3 포함 기능 중 이 계획 소관인 대화방·인용 답장·수정·삭제·반응·읽음·고정·검색·활동 피드 전부 태스크에 매핑됨. 파일 첨부·프레즌스·실시간 반영·알림은 계획 ③, UI·필터 칩은 계획 ④ 소관(스펙 로드맵과 일치). 임베드 키 발급·관리는 계획 ⑥.
- **이월 제약 반영**: fastify-plugin(T1), setErrorHandler(T1), 허용목록 매 요청 재검사(T1), 세션 만료 14일 결정(T1), ConversationMember.userId 인덱스·pg_trgm(T6). resetDb 테이블 목록은 이 계획에서 테이블 추가가 없어 변경 불필요. PrismaClient $disconnect 정리는 테스트 증가 후에도 vitest 프로세스 종료로 회수되므로 보류(레저에 유지).
- **플레이스홀더 스캔**: TBD/TODO/"적절히" 없음. Step 2(T6)에 Prisma 6.19.3의 Gin ops 문법 실패 시의 구체적 폴백 경로를 명시함(추측성 지시가 아니라 두 경로 모두 실행 가능한 지시).
- **타입 일관성**: `summarizeConversation`·`isMember`(T2 정의 → T3~T5 사용), `toMessageDto`·`messageInclude`(T3 정의 → T5·상세에서 재사용), `makeTestApp`/`loginAs`/`cookieHeader`(T1 정의 → 전 태스크 사용), DTO 필드명(shared 스키마 ↔ 서버 직렬화기) 대조 완료. `GET /conversations/:id` 응답의 `pinnedMessage`는 shared 스키마에 별도 타입을 만들지 않고 `ConversationSummary & { pinnedMessage }`로 서버 응답만 확장(클라이언트 계획 ④에서 필요 시 스키마化).
