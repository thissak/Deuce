# Deuce 계획 ③ — Socket.IO 실시간·프레즌스·파일 첨부 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 계획 ②의 REST API 위에 Socket.IO 실시간 브로드캐스트·프레즌스·파일 첨부를 얹고, 계획 ② 이월 항목(타인 제거, 204→DTO 전환, 커서 정합, 삭제 메시지 가드)을 정리한다.

**Architecture:** Socket.IO 서버를 Fastify의 http 서버에 붙이고, 핸드셰이크에서 secure-session 쿠키를 복호화해 인증한다(`app.decodeSecureSession`). 룸은 `user:{id}`·`convo:{id}` 2종. 라우트 핸들러가 DB 쓰기 직후 `app.io`로 이벤트를 발행한다 — 메시지급 이벤트는 DTO를 실어 append용, 대화방급 이벤트는 `{conversationId}`만 실어 invalidate용. 프레즌스는 인메모리 트래커. 파일은 서버 경유 업로드/다운로드 + 스토리지 드라이버(로컬 디스크, 운영 GCS는 계획 ⑥) — 다운로드마다 멤버십을 검사한다(스펙 §3 문구를 이 계획에서 수정).

**Tech Stack:** socket.io 4 (서버)·socket.io-client(테스트), cookie(핸드셰이크 파싱), @fastify/multipart, 기존 스택(Fastify 5, Prisma 6.19.3 핀, PostgreSQL, zod 4, vitest 실 DB).

**Spec:** `docs/design/2026-08-29-deuce-v1-spec.md` (§3 기능, §5 데이터 흐름·이벤트 목록, §8 인증)

**로드맵 위치:** 6개 계획 중 3번. UI는 계획 ④, Electron ⑤, 임베드·배포(GCS 드라이버 포함) ⑥.

## Global Constraints

- **Prisma·@prisma/client 6.19.3 정확 핀 (ADR 003). 업그레이드·prisma 계열 신규 설치 금지.**
- ESM + TS strict + NodeNext — 상대 import `.js` 확장자. `tsc --noEmit` 양 패키지 통과.
- 테스트는 실제 로컬 PostgreSQL `deuce_test`(:5434) 대상. **`docker compose up` 금지** — 계획 ①의 컨테이너(server-foundation-postgres-1)가 이미 :5434에서 실행 중.
- 실시간 이벤트 이름은 스펙 §5를 따른다: `message.new`/`message.updated`/`message.deleted`/`reaction.changed`/`read.advanced`/`presence.changed`. 추가로 `conversation.created`/`conversation.updated`/`conversation.removed`를 정의한다(스펙 목록은 예시이며 폐쇄 목록이 아님). **핀 변경은 별도 이벤트 없이 `message.updated`로 통일**(DTO에 pinnedAt 포함).
- 재접속·룸 관리 프리미티브 손코딩 금지 — Socket.IO 내장 기능(rooms, socketsJoin/Leave)만 사용.
- 소켓 인증은 REST 가드와 동일 규칙: 세션 쿠키 → 사용자 조회 → 허용목록 검사. 실패 시 연결 거부. (연결 유지 중 허용목록 탈락은 다음 재연결에서 차단 — 수용된 한계, 레저에 기록됨)
- 규모 전제: 동시 수십 명 — 인메모리 프레즌스·라우트 내 개별 emit 허용, Redis 어댑터 금지(YAGNI).
- 업로드 한도 25MB(`MAX_UPLOAD_BYTES` 기본 26214400). `uploads/` 디렉터리는 커밋 금지(.gitignore).
- 커밋은 각 태스크의 명시된 파일만. `apps/server/.env` 커밋 금지.
- 새 워크트리 셋업: `pnpm install` 후 `cd apps/server && pnpm prisma generate` 필요(postinstall 없음).

## 파일 구조 (이 계획이 만들/고치는 것)

```
apps/server/src/
├── app.ts                      # (수정) multipart·storage·setupRealtime 등록
├── config.ts                   # (수정) UPLOAD_DIR·MAX_UPLOAD_BYTES
├── storage.ts                  # (신규) FileStorage 인터페이스 + LocalDiskStorage
├── realtime/
│   ├── io.ts                   # (신규) Socket.IO 셋업·쿠키 인증·룸 조인·프레즌스 와이어링
│   └── presence.ts             # (신규) PresenceTracker (인메모리)
├── domain/conversations.ts     # (수정) unreadCount (createdAt,id) 정합
└── routes/
    ├── conversations.ts        # (수정) 타인 제거, read DTO 반환·커서 정합, 대화방 이벤트
    ├── messages.ts             # (수정) 반응·핀 DTO 반환, 삭제 가드, 메시지 이벤트
    ├── attachments.ts          # (신규) 업로드·다운로드·공유 탭
    └── presence.ts             # (신규) GET /presence
packages/shared/src/
├── events.ts                   # (신규) RT 이벤트 이름 상수·페이로드 타입
├── attachment.ts               # (신규) AttachmentDto·SharedFile 스키마
├── message.ts                  # (수정) MessageDto에 attachments 추가
└── index.ts                    # (수정) 재수출
apps/server/test/
├── ws-helpers.ts               # (신규) listen/wsConnect/waitForEvent
├── carryover-rest.test.ts      # T1
├── realtime-core.test.ts       # T2
├── realtime-messages.test.ts   # T3
├── realtime-conversations.test.ts # T4
├── presence.test.ts            # T5
└── attachments.test.ts         # T6
(기존 message-actions.test.ts·conversation-admin.test.ts는 T1에서 204→200 전환에 맞춰 수정)
```

---

### Task 1: 이월 REST 정리 — 타인 제거·DTO 반환 전환·커서 정합·삭제 가드

**Files:**
- Modify: `apps/server/src/routes/conversations.ts`, `apps/server/src/routes/messages.ts`, `apps/server/src/domain/conversations.ts`
- Modify(테스트 전환): `apps/server/test/message-actions.test.ts`, `apps/server/test/conversation-admin.test.ts`
- Test: `apps/server/test/carryover-rest.test.ts`

**Interfaces:**
- Consumes: `isMember`·`summarizeConversation`, `memberMessage`(messages.ts 내부), `messageInclude`·`toMessageDto`, `makeTestApp`/`loginAs`
- Produces (이후 태스크·계획 ④.가 의존):
  - `DELETE /api/conversations/:id/members/:userId` — GROUP만(400), 호출자 멤버(403), 대상이 멤버 아니면 404 → 200 summary. **ReadState는 삭제하지 않는다**(정책 결정: 재가입 시 부재 기간 메시지는 안 읽음으로 표시 — 실제로 안 읽었으므로)
  - `PUT/DELETE /api/messages/:id/reactions[...]` → **200 MessageDto** (기존 204에서 전환)
  - `PUT/DELETE /api/messages/:id/pin` → **200 MessageDto**
  - `PUT /api/conversations/:id/read` → **200 `{ conversationId, lastReadMessageId }`**
  - 삭제된 메시지에 반응·핀 → 400
  - 읽음 커서 비교·unreadCount가 페이지네이션과 동일한 (createdAt, id) 순서 사용

- [ ] **Step 1: 기존 테스트를 새 계약으로 전환** (RED가 되도록 먼저 고친다)

`apps/server/test/message-actions.test.ts`에서:
- reactions 멱등 테스트의 루프 내 `expect(res.statusCode).toBe(204)` → `expect(res.statusCode).toBe(200)`
- 같은 테스트의 remove: `expect(remove.statusCode).toBe(204)` → `toBe(200)`
- pin 테스트: `expect(pin.statusCode).toBe(204)` → `toBe(200)`, `expect(unpin.statusCode).toBe(204)` → `toBe(200)`, 그리고 pin 응답 검증 추가:

```ts
    const pinnedDto = MessageDtoSchema.parse(pin.json())
    expect(pinnedDto.pinnedAt).not.toBeNull()
```

`apps/server/test/conversation-admin.test.ts`의 읽음 커서 테스트에서:
- `expect(read2.statusCode).toBe(204)` → 다음으로 교체:

```ts
    expect(read2.statusCode).toBe(200)
    expect(read2.json()).toEqual({ conversationId: t.groupId, lastReadMessageId: m2.id })
```

- `expect(rewind.statusCode).toBe(204)` → `expect(rewind.statusCode).toBe(200)` 로 교체하고 바로 아래에 추가:

```ts
    expect((rewind.json() as { lastReadMessageId: string }).lastReadMessageId).toBe(m2.id)
```

- [ ] **Step 2: 신규 테스트 작성** — `apps/server/test/carryover-rest.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { ConversationSummary, UserDto } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb, testDb } from './helpers.js'

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
    payload: { type: 'group', title: '이월방', memberIds: [ids.b] },
  })
  return { ...t, aCookie, bCookie, groupId: (convo.json() as { id: string }).id, ids }
}

describe('carryover rest fixes', () => {
  beforeEach(resetDb)

  it('removes another member from a group', async () => {
    const t = await setupGroup()
    const res = await t.app.inject({
      method: 'DELETE', url: `/api/conversations/${t.groupId}/members/${t.ids.b}`,
      headers: { cookie: t.aCookie },
    })
    expect(res.statusCode).toBe(200)
    const dto = res.json() as ConversationSummary
    expect(dto.members.map((m) => m.id)).not.toContain(t.ids.b)

    const bList = await t.app.inject({
      method: 'GET', url: '/api/conversations', headers: { cookie: t.bCookie },
    })
    expect(bList.json()).toEqual([])

    const notMember = await t.app.inject({
      method: 'DELETE', url: `/api/conversations/${t.groupId}/members/${t.ids.c}`,
      headers: { cookie: t.aCookie },
    })
    expect(notMember.statusCode).toBe(404)
  })

  it('rejects removing a member from a dm', async () => {
    const t = await setupGroup()
    const dm = await t.app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: t.aCookie },
      payload: { type: 'dm', otherUserId: t.ids.b },
    })
    const dmId = (dm.json() as { id: string }).id
    const res = await t.app.inject({
      method: 'DELETE', url: `/api/conversations/${dmId}/members/${t.ids.b}`,
      headers: { cookie: t.aCookie },
    })
    expect(res.statusCode).toBe(400)
  })

  it('treats read-cursor ties by id like pagination does', async () => {
    const t = await setupGroup()
    const tied = new Date('2026-08-29T00:00:00.000Z')
    const ID1 = '00000000-0000-4000-8000-000000000001'
    const ID2 = '00000000-0000-4000-8000-000000000002'
    await testDb.message.createMany({
      data: [
        { id: ID1, conversationId: t.groupId, authorId: t.ids.b, body: '동시1', createdAt: tied },
        { id: ID2, conversationId: t.groupId, authorId: t.ids.b, body: '동시2', createdAt: tied },
      ],
    })
    const unread = async (): Promise<number> => {
      const list = await t.app.inject({
        method: 'GET', url: '/api/conversations', headers: { cookie: t.aCookie },
      })
      return (list.json() as ConversationSummary[])[0]!.unreadCount
    }
    expect(await unread()).toBe(2)

    const read1 = await t.app.inject({
      method: 'PUT', url: `/api/conversations/${t.groupId}/read`, headers: { cookie: t.aCookie },
      payload: { messageId: ID1 },
    })
    expect(read1.statusCode).toBe(200)
    expect(await unread()).toBe(1) // 같은 createdAt이라도 id가 큰 동시2는 안 읽음

    await t.app.inject({
      method: 'PUT', url: `/api/conversations/${t.groupId}/read`, headers: { cookie: t.aCookie },
      payload: { messageId: ID2 },
    })
    expect(await unread()).toBe(0)

    const rewind = await t.app.inject({
      method: 'PUT', url: `/api/conversations/${t.groupId}/read`, headers: { cookie: t.aCookie },
      payload: { messageId: ID1 },
    })
    expect(rewind.statusCode).toBe(200)
    expect((rewind.json() as { lastReadMessageId: string }).lastReadMessageId).toBe(ID2)
  })

  it('rejects reacting to and pinning a deleted message', async () => {
    const t = await setupGroup()
    const msg = await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.groupId}/messages`,
      headers: { cookie: t.aCookie }, payload: { body: '곧 삭제' },
    })
    const msgId = (msg.json() as { id: string }).id
    await t.app.inject({ method: 'DELETE', url: `/api/messages/${msgId}`, headers: { cookie: t.aCookie } })
    const react = await t.app.inject({
      method: 'PUT', url: `/api/messages/${msgId}/reactions`, headers: { cookie: t.bCookie },
      payload: { emoji: '👍' },
    })
    expect(react.statusCode).toBe(400)
    const pin = await t.app.inject({
      method: 'PUT', url: `/api/messages/${msgId}/pin`, headers: { cookie: t.bCookie },
    })
    expect(pin.statusCode).toBe(400)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `cd apps/server && pnpm vitest run test/carryover-rest.test.ts test/message-actions.test.ts test/conversation-admin.test.ts`
Expected: FAIL — 타인 제거 404(라우트 없음), 204 vs 200 불일치, 동률 커서 카운트 오류, 삭제 메시지 반응 204

- [ ] **Step 4: 구현**

`apps/server/src/routes/conversations.ts` — `DELETE /conversations/:id/members/me` 라우트 **아래에** 추가:

```ts
  app.delete('/conversations/:id/members/:userId', async (req, reply) => {
    const { id, userId } = req.params as { id: string; userId: string }
    const me = req.currentUser.id
    if (!(await isMember(id, me))) return reply.code(403).send({ error: 'not a member' })
    const convo = await prisma.conversation.findUniqueOrThrow({ where: { id } })
    if (convo.type !== 'GROUP') return reply.code(400).send({ error: 'group only' })
    if (!(await isMember(id, userId))) return reply.code(404).send({ error: 'member not found' })
    // ReadState는 남긴다 — 재가입 시 부재 기간 메시지를 안 읽음으로 보이게 하는 의도된 정책
    await prisma.conversationMember.delete({
      where: { conversationId_userId: { conversationId: id, userId } },
    })
    return reply.code(200).send(await summarizeConversation(id, me))
  })
```

같은 파일의 `PUT /conversations/:id/read` — no-op 비교와 응답을 교체. 현재 블록의
`if (current?.lastReadMessageId) { ... }`와 마지막 `return reply.code(204).send()`를
다음으로 바꾼다 (upsert는 유지):

```ts
    if (current?.lastReadMessageId) {
      const cur = await prisma.message.findUnique({ where: { id: current.lastReadMessageId } })
      const curIsNewer =
        cur &&
        (cur.createdAt > msg.createdAt ||
          (cur.createdAt.getTime() === msg.createdAt.getTime() && cur.id > msg.id))
      if (curIsNewer) {
        return reply.code(200).send({ conversationId: id, lastReadMessageId: cur.id })
      }
    }
    await prisma.readState.upsert({
      where: { userId_conversationId: { userId: me, conversationId: id } },
      create: { userId: me, conversationId: id, lastReadMessageId: msg.id },
      update: { lastReadMessageId: msg.id },
    })
    return reply.code(200).send({ conversationId: id, lastReadMessageId: msg.id })
```

`apps/server/src/domain/conversations.ts` — unreadCount 블록 교체. 기존
`let lastReadAt ... const unreadCount = await prisma.message.count({...})` 부분을 다음으로:

```ts
  let lastRead: { createdAt: Date; id: string } | null = null
  if (read?.lastReadMessageId) {
    const lr = await prisma.message.findUnique({ where: { id: read.lastReadMessageId } })
    if (lr) lastRead = { createdAt: lr.createdAt, id: lr.id }
  }
  const meMember = convo.members.find((m) => m.userId === meId)
  // 기준선: 읽음 커서 > (없으면) 합류 시점. 커서 비교는 페이지네이션과 같은 (createdAt, id) 순서.
  const unreadCount = await prisma.message.count({
    where: {
      conversationId,
      deletedAt: null,
      authorId: { not: meId },
      ...(lastRead
        ? {
            OR: [
              { createdAt: { gt: lastRead.createdAt } },
              { createdAt: lastRead.createdAt, id: { gt: lastRead.id } },
            ],
          }
        : meMember
          ? { createdAt: { gt: meMember.joinedAt } }
          : {}),
    },
  })
```

(주의: 기존 코드의 `meMember` 선언이 이 블록보다 아래에 있다면 위로 끌어올리고 중복 선언을 제거한다.)

`apps/server/src/routes/messages.ts` — 반응·핀 4개 라우트 수정:

PUT reactions: `memberMessage` 검사 직후에 삭제 가드 추가, 마지막 204 응답을 DTO로 교체:

```ts
    if (msg.deletedAt) return reply.code(400).send({ error: 'message deleted' })
```

```ts
    const updated = await prisma.message.findUniqueOrThrow({
      where: { id }, include: messageInclude,
    })
    return reply.code(200).send(toMessageDto(updated))
```

DELETE reactions/:emoji — deleteMany 뒤 동일하게 재조회 후 `200 toMessageDto`.
PUT pin — `memberMessage` 직후 `if (msg.deletedAt) return reply.code(400)...` 추가,
`prisma.message.update`를 `const updated = await prisma.message.update({ where: { id }, data: { pinnedAt: new Date() }, include: messageInclude })`로 바꾸고 `200 toMessageDto(updated)` 반환.
DELETE pin — 같은 방식(`pinnedAt: null`)으로 `200 toMessageDto(updated)` 반환 (삭제 가드는 핀 해제엔 걸지 않는다 — 삭제된 메시지의 잔여 핀을 풀 수 있어야 함).

- [ ] **Step 5: 전체 테스트·타입체크 통과 확인**

Run: `cd apps/server && pnpm test && pnpm typecheck`
Expected: 전부 PASS (46 기존 중 전환분 포함 + 신규 4)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src apps/server/test
git commit -m "feat: add member removal, dto-returning actions and tie-aware read cursor"
```

---

### Task 2: Socket.IO 코어 — 쿠키 인증·룸 조인·테스트 인프라

**Files:**
- Create: `apps/server/src/realtime/io.ts`, `apps/server/test/ws-helpers.ts`
- Modify: `apps/server/src/app.ts`, `apps/server/package.json`(deps)
- Test: `apps/server/test/realtime-core.test.ts`

**Interfaces:**
- Consumes: `buildApp`·`AppConfig`·`prisma`·세션(`decodeSecureSession`은 @fastify/secure-session이 Fastify 인스턴스에 데코레이트하는 메서드)
- Produces:
  - `setupRealtime(app: FastifyInstance, config: AppConfig): void` — `app.io: Server` 데코레이트, 핸드셰이크 인증(`socket.data.userId`), 접속 시 `user:{id}` + 모든 `convo:{id}` 룸 조인, onClose에서 `io.close()`
  - 룸 이름 규약: `user:{userId}`, `convo:{conversationId}` — T3·T4가 사용
  - 테스트 헬퍼: `listen(app): Promise<number>`(포트), `wsConnect(port, cookie): Promise<ClientSocket>`, `waitForEvent<T>(socket, event, timeoutMs?): Promise<T>`

- [ ] **Step 1: 의존성 설치**

Run: `cd apps/server && pnpm add socket.io cookie && pnpm add -D socket.io-client @types/cookie`
(참고: cookie v1은 자체 타입 내장 — `@types/cookie` 설치가 불필요하다고 나오면 생략하고 보고서에 기록)

- [ ] **Step 2: 테스트 헬퍼 작성** — `apps/server/test/ws-helpers.ts`

```ts
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client'

export async function listen(app: FastifyInstance): Promise<number> {
  await app.listen({ port: 0, host: '127.0.0.1' })
  return (app.server.address() as AddressInfo).port
}

export function wsConnect(port: number, cookie: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      extraHeaders: { cookie },
      reconnection: false,
    })
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', (err) => {
      socket.close()
      reject(err)
    })
  })
}

export function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${event}`)),
      timeoutMs,
    )
    socket.once(event, (payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}
```

- [ ] **Step 3: 실패하는 테스트 작성** — `apps/server/test/realtime-core.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Socket as ClientSocket } from 'socket.io-client'
import type { FastifyInstance } from 'fastify'
import type { UserDto } from '@deuce/shared'
import { makeTestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'
import { listen, wsConnect } from './ws-helpers.js'

describe('realtime core', () => {
  let app: FastifyInstance | null = null
  const sockets: ClientSocket[] = []

  beforeEach(resetDb)
  afterEach(async () => {
    for (const s of sockets) s.close()
    sockets.length = 0
    if (app) await app.close()
    app = null
  })

  it('rejects a connection without a valid session', async () => {
    const t = await makeTestApp()
    app = t.app
    const port = await listen(t.app)
    await expect(wsConnect(port, 'session=garbage')).rejects.toThrow()
  })

  it('accepts a logged-in user and joins conversation rooms', async () => {
    const t = await makeTestApp()
    app = t.app
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

    const port = await listen(t.app)
    const socket = await wsConnect(port, aCookie)
    sockets.push(socket)

    // 접속 직후 룸 조인은 비동기 — 짧게 재시도하며 확인
    let joined = 0
    for (let i = 0; i < 20 && joined === 0; i += 1) {
      joined = (await t.app.io.in(`convo:${convoId}`).fetchSockets()).length
      if (joined === 0) await new Promise((r) => setTimeout(r, 50))
    }
    expect(joined).toBe(1)
    const userRoom = await t.app.io.in(`user:${socket.id ? '' : ''}`).fetchSockets()
    void userRoom // user 룸 검증은 아래 별도 단언으로
    const aId = users.find((u) => u.email === 'a@goldenlabs.dev')!.id
    expect((await t.app.io.in(`user:${aId}`).fetchSockets()).length).toBe(1)
  })
})
```

- [ ] **Step 4: 실패 확인**

Run: `cd apps/server && pnpm vitest run test/realtime-core.test.ts`
Expected: FAIL — `app.io` undefined / 연결이 소켓 서버 부재로 실패

- [ ] **Step 5: 구현**

`apps/server/src/realtime/io.ts`:

```ts
import { Server } from 'socket.io'
import { parse as parseCookie } from 'cookie'
import type { FastifyInstance } from 'fastify'
import type { AppConfig } from '../config.js'
import { prisma } from '../db.js'
import '../auth/session.js'

declare module 'fastify' {
  interface FastifyInstance {
    io: Server
  }
}

export function setupRealtime(app: FastifyInstance, config: AppConfig): void {
  const io = new Server(app.server, { serveClient: false })

  io.use(async (socket, next) => {
    try {
      const header = socket.handshake.headers.cookie
      const cookies = header ? parseCookie(header) : {}
      const raw = cookies['session']
      const session = raw ? app.decodeSecureSession(raw) : null
      const userId = session?.get('userId')
      if (!userId) return next(new Error('unauthorized'))
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user || !config.allowedEmails.includes(user.email)) {
        return next(new Error('unauthorized'))
      }
      socket.data.userId = user.id
      return next()
    } catch {
      return next(new Error('unauthorized'))
    }
  })

  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string
    await socket.join(`user:${userId}`)
    const memberships = await prisma.conversationMember.findMany({ where: { userId } })
    await socket.join(memberships.map((m) => `convo:${m.conversationId}`))
  })

  app.decorate('io', io)
  app.addHook('onClose', async () => {
    io.close()
  })
}
```

`apps/server/src/app.ts` — import 추가 후, 라우트 등록이 모두 끝난 뒤 `return app` 직전에:

```ts
import { setupRealtime } from './realtime/io.js'
```

```ts
  setupRealtime(app, config)
```

- [ ] **Step 6: 전체 테스트·타입체크 통과 확인**

Run: `cd apps/server && pnpm test && pnpm typecheck`
Expected: 전부 PASS. 소켓 테스트가 열어둔 핸들 때문에 vitest가 안 끝나면 afterEach의 `app.close()` 누락을 의심할 것.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src apps/server/test apps/server/package.json pnpm-lock.yaml
git commit -m "feat: attach socket.io with cookie auth and room join"
```

---

### Task 3: 메시지·반응·핀·읽음 브로드캐스트

**Files:**
- Create: `packages/shared/src/events.ts`
- Modify: `packages/shared/src/index.ts`, `apps/server/src/routes/messages.ts`, `apps/server/src/routes/conversations.ts`(read만)
- Test: `apps/server/test/realtime-messages.test.ts`

**Interfaces:**
- Consumes: `app.io`·룸 규약(T2), DTO 반환 라우트(T1), `toMessageDto`
- Produces (`@deuce/shared`):

```ts
// packages/shared/src/events.ts
import type { MessageDto } from './message.js'

export const RT = {
  messageNew: 'message.new',
  messageUpdated: 'message.updated',
  messageDeleted: 'message.deleted',
  reactionChanged: 'reaction.changed',
  readAdvanced: 'read.advanced',
  conversationCreated: 'conversation.created',
  conversationUpdated: 'conversation.updated',
  conversationRemoved: 'conversation.removed',
  presenceChanged: 'presence.changed',
} as const

export interface ReadAdvancedPayload {
  conversationId: string
  userId: string
  lastReadMessageId: string
}

export interface ConversationEventPayload {
  conversationId: string
}

export interface PresencePayload {
  userId: string
  status: 'online' | 'away' | 'offline'
}

export type MessageEventPayload = MessageDto
```

  - 발행 규약: `message.new`/`message.updated`/`message.deleted`/`reaction.changed` → `convo:{id}` 룸에 MessageDto(삭제는 마스킹된 DTO). `read.advanced` → `convo:{id}` 룸에 ReadAdvancedPayload

- [ ] **Step 1: shared 이벤트 파일 생성 + index 재수출**

위 events.ts 코드 그대로 생성. `packages/shared/src/index.ts`에 추가:

```ts
export {
  RT,
  type ReadAdvancedPayload,
  type ConversationEventPayload,
  type PresencePayload,
  type MessageEventPayload,
} from './events.js'
```

- [ ] **Step 2: 실패하는 테스트 작성** — `apps/server/test/realtime-messages.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Socket as ClientSocket } from 'socket.io-client'
import type { FastifyInstance } from 'fastify'
import { RT, type MessageDto, type ReadAdvancedPayload, type UserDto } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'
import { listen, wsConnect, waitForEvent } from './ws-helpers.js'

interface Ctx extends TestApp {
  aCookie: string
  bCookie: string
  convoId: string
  port: number
  bSocket: ClientSocket
}

describe('realtime message events', () => {
  let app: FastifyInstance | null = null
  const sockets: ClientSocket[] = []

  beforeEach(resetDb)
  afterEach(async () => {
    for (const s of sockets) s.close()
    sockets.length = 0
    if (app) await app.close()
    app = null
  })

  async function setup(): Promise<Ctx> {
    const t = await makeTestApp()
    app = t.app
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
    const port = await listen(t.app)
    const bSocket = await wsConnect(port, bCookie)
    sockets.push(bSocket)
    // b의 룸 조인 완료 대기
    for (let i = 0; i < 20; i += 1) {
      if ((await t.app.io.in(`convo:${convoId}`).fetchSockets()).length > 0) break
      await new Promise((r) => setTimeout(r, 50))
    }
    return { ...t, aCookie, bCookie, convoId, port, bSocket }
  }

  it('broadcasts message.new on post', async () => {
    const c = await setup()
    const waiting = waitForEvent<MessageDto>(c.bSocket, RT.messageNew)
    const posted = await c.app.inject({
      method: 'POST', url: `/api/conversations/${c.convoId}/messages`,
      headers: { cookie: c.aCookie }, payload: { body: '실시간 안녕' },
    })
    const dto = await waiting
    expect(dto.id).toBe((posted.json() as { id: string }).id)
    expect(dto.body).toBe('실시간 안녕')
  })

  it('broadcasts reaction.changed, message.updated(pin) and masked message.deleted', async () => {
    const c = await setup()
    const posted = await c.app.inject({
      method: 'POST', url: `/api/conversations/${c.convoId}/messages`,
      headers: { cookie: c.aCookie }, payload: { body: '대상' },
    })
    const msgId = (posted.json() as { id: string }).id

    const reactWait = waitForEvent<MessageDto>(c.bSocket, RT.reactionChanged)
    await c.app.inject({
      method: 'PUT', url: `/api/messages/${msgId}/reactions`,
      headers: { cookie: c.aCookie }, payload: { emoji: '👍' },
    })
    expect((await reactWait).reactions[0]!.emoji).toBe('👍')

    const pinWait = waitForEvent<MessageDto>(c.bSocket, RT.messageUpdated)
    await c.app.inject({
      method: 'PUT', url: `/api/messages/${msgId}/pin`, headers: { cookie: c.aCookie },
    })
    expect((await pinWait).pinnedAt).not.toBeNull()

    const delWait = waitForEvent<MessageDto>(c.bSocket, RT.messageDeleted)
    await c.app.inject({
      method: 'DELETE', url: `/api/messages/${msgId}`, headers: { cookie: c.aCookie },
    })
    const deleted = await delWait
    expect(deleted).toMatchObject({ id: msgId, deleted: true, body: '' })
  })

  it('broadcasts read.advanced', async () => {
    const c = await setup()
    const posted = await c.app.inject({
      method: 'POST', url: `/api/conversations/${c.convoId}/messages`,
      headers: { cookie: c.bCookie }, payload: { body: '읽어줘' },
    })
    const msgId = (posted.json() as { id: string }).id
    const waiting = waitForEvent<ReadAdvancedPayload>(c.bSocket, RT.readAdvanced)
    await c.app.inject({
      method: 'PUT', url: `/api/conversations/${c.convoId}/read`,
      headers: { cookie: c.aCookie }, payload: { messageId: msgId },
    })
    const payload = await waiting
    expect(payload).toMatchObject({ conversationId: c.convoId, lastReadMessageId: msgId })
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `cd apps/server && pnpm vitest run test/realtime-messages.test.ts`
Expected: FAIL — waitForEvent 타임아웃(emit 없음)

- [ ] **Step 4: 구현** — 라우트에 emit 추가

`apps/server/src/routes/messages.ts` 상단 import에 추가:

```ts
import { RT } from '@deuce/shared'
```

각 핸들러의 성공 응답 직전에 (T1에서 만든 DTO 변수를 재사용):

- POST messages: `app.io.to(\`convo:${id}\`).emit(RT.messageNew, toMessageDto(created))` — 응답과 같은 DTO를 한 번만 만들어 변수로 재사용한다
- PATCH message: `app.io.to(\`convo:${msg.conversationId}\`).emit(RT.messageUpdated, dto)`
- DELETE message: soft delete 후 `const masked = await prisma.message.findUniqueOrThrow({ where: { id }, include: messageInclude })` → `app.io.to(...).emit(RT.messageDeleted, toMessageDto(masked))` (204 응답은 유지)
- PUT/DELETE reactions: `app.io.to(...).emit(RT.reactionChanged, dto)`
- PUT/DELETE pin: `app.io.to(...).emit(RT.messageUpdated, dto)`

`apps/server/src/routes/conversations.ts` — PUT read의 upsert 성공 경로에서 (import에 RT 추가):

```ts
    app.io.to(`convo:${id}`).emit(RT.readAdvanced, {
      conversationId: id,
      userId: me,
      lastReadMessageId: msg.id,
    })
```

(no-op 경로에서는 발행하지 않는다.)

- [ ] **Step 5: 전체 테스트·양쪽 타입체크 통과**

Run: `cd apps/server && pnpm test && pnpm typecheck && cd ../../packages/shared && pnpm typecheck`

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src apps/server/src apps/server/test
git commit -m "feat: broadcast message, reaction and read events over socket.io"
```

---

### Task 4: 대화방 이벤트 — created/updated/removed + 룸 동기화

**Files:**
- Modify: `apps/server/src/routes/conversations.ts`
- Test: `apps/server/test/realtime-conversations.test.ts`

**Interfaces:**
- Consumes: `app.io`, `RT`, 룸 규약
- Produces 발행 규약 (계획 ④ 클라이언트 캐시 계약):
  - 대화방 생성(그룹, 신규 DM): 각 멤버 `user:{uid}` 룸에 `conversation.created` `{conversationId}` + `io.in(\`user:${uid}\`).socketsJoin(\`convo:${id}\`)`
  - 제목 변경·멤버 추가: `convo:{id}` 룸에 `conversation.updated` `{conversationId}`; 추가된 멤버는 socketsJoin + 본인 user 룸에 `conversation.created`
  - 나가기·타인 제거: 대상 `user:{uid}`에 `conversation.removed` `{conversationId}` + socketsLeave; 남은 룸에 `conversation.updated`
  - 음소거는 로컬 상태 — 이벤트 없음

- [ ] **Step 1: 실패하는 테스트 작성** — `apps/server/test/realtime-conversations.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Socket as ClientSocket } from 'socket.io-client'
import type { FastifyInstance } from 'fastify'
import { RT, type ConversationEventPayload, type UserDto } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'
import { listen, wsConnect, waitForEvent } from './ws-helpers.js'

describe('realtime conversation events', () => {
  let app: FastifyInstance | null = null
  const sockets: ClientSocket[] = []

  beforeEach(resetDb)
  afterEach(async () => {
    for (const s of sockets) s.close()
    sockets.length = 0
    if (app) await app.close()
    app = null
  })

  it('notifies members on create, rename and removal, syncing rooms', async () => {
    const t = await makeTestApp()
    app = t.app
    const aCookie = await t.loginAs('a@goldenlabs.dev', 'A')
    const bCookie = await t.loginAs('b@goldenlabs.dev', 'B')
    const users = (
      await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
    ).json() as UserDto[]
    const bId = users.find((u) => u.email === 'b@goldenlabs.dev')!.id
    const port = await listen(t.app)
    const bSocket = await wsConnect(port, bCookie)
    sockets.push(bSocket)

    // 생성: b가 conversation.created 수신 + 룸 자동 조인
    const createdWait = waitForEvent<ConversationEventPayload>(bSocket, RT.conversationCreated)
    const convo = await t.app.inject({
      method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
      payload: { type: 'group', title: '실시간방', memberIds: [bId] },
    })
    const convoId = (convo.json() as { id: string }).id
    expect((await createdWait).conversationId).toBe(convoId)
    for (let i = 0; i < 20; i += 1) {
      if ((await t.app.io.in(`convo:${convoId}`).fetchSockets()).length > 0) break
      await new Promise((r) => setTimeout(r, 50))
    }
    expect((await t.app.io.in(`convo:${convoId}`).fetchSockets()).length).toBe(1)

    // 이름 변경: conversation.updated
    const updatedWait = waitForEvent<ConversationEventPayload>(bSocket, RT.conversationUpdated)
    await t.app.inject({
      method: 'PATCH', url: `/api/conversations/${convoId}`, headers: { cookie: aCookie },
      payload: { title: '바뀐 이름' },
    })
    expect((await updatedWait).conversationId).toBe(convoId)

    // 타인 제거: b가 conversation.removed 수신 + 룸 이탈
    const removedWait = waitForEvent<ConversationEventPayload>(bSocket, RT.conversationRemoved)
    await t.app.inject({
      method: 'DELETE', url: `/api/conversations/${convoId}/members/${bId}`,
      headers: { cookie: aCookie },
    })
    expect((await removedWait).conversationId).toBe(convoId)
    for (let i = 0; i < 20; i += 1) {
      if ((await t.app.io.in(`convo:${convoId}`).fetchSockets()).length === 0) break
      await new Promise((r) => setTimeout(r, 50))
    }
    expect((await t.app.io.in(`convo:${convoId}`).fetchSockets()).length).toBe(0)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/server && pnpm vitest run test/realtime-conversations.test.ts`
Expected: FAIL — 이벤트 타임아웃

- [ ] **Step 3: 구현** — `apps/server/src/routes/conversations.ts`

파일 내 공용 헬퍼 추가 (플러그인 함수 위, import에 RT 추가):

```ts
function announceConversation(app: Parameters<typeof conversationRoutes>[0], memberIds: string[], conversationId: string): void {
  for (const uid of memberIds) {
    app.io.in(`user:${uid}`).socketsJoin(`convo:${conversationId}`)
    app.io.to(`user:${uid}`).emit(RT.conversationCreated, { conversationId })
  }
}
```

(타입이 번거로우면 `import type { FastifyInstance } from 'fastify'` 후 `app: FastifyInstance`로 선언한다.)

- POST /conversations: DM 신규 생성(201) 경로와 GROUP 생성 경로의 응답 직전에 `announceConversation(app, memberIds, convo.id)` — DM은 `[me, otherUserId]`, GROUP은 `memberIds` 배열. (기존 DM 200 재사용 경로에는 발행하지 않음)
- PATCH /conversations/:id: 응답 직전 `app.io.to(\`convo:${id}\`).emit(RT.conversationUpdated, { conversationId: id })`
- POST /conversations/:id/members: createMany 후 `announceConversation(app, userIds, id)` + `app.io.to(\`convo:${id}\`).emit(RT.conversationUpdated, { conversationId: id })`
- DELETE /conversations/:id/members/me: delete 후

```ts
    app.io.to(`user:${me}`).emit(RT.conversationRemoved, { conversationId: id })
    app.io.in(`user:${me}`).socketsLeave(`convo:${id}`)
    app.io.to(`convo:${id}`).emit(RT.conversationUpdated, { conversationId: id })
```

- DELETE /conversations/:id/members/:userId (T1): delete 후 같은 3줄을 `userId` 대상으로.

- [ ] **Step 4: 전체 테스트·타입체크 통과**

Run: `cd apps/server && pnpm test && pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/server/src apps/server/test
git commit -m "feat: broadcast conversation lifecycle events with room sync"
```

---

### Task 5: 프레즌스 — 트래커·이벤트·스냅샷 API

**Files:**
- Create: `apps/server/src/realtime/presence.ts`, `apps/server/src/routes/presence.ts`
- Modify: `apps/server/src/realtime/io.ts`, `apps/server/src/app.ts`(라우트 등록)
- Test: `apps/server/test/presence.test.ts`

**Interfaces:**
- Consumes: `setupRealtime`·`app.io`, `RT.presenceChanged`, `PresencePayload`
- Produces:
  - `PresenceTracker` (`src/realtime/presence.ts`):

```ts
export type PresenceStatus = 'online' | 'away' | 'offline'

export class PresenceTracker {
  connect(userId: string): PresenceStatus | null   // 상태가 바뀌면 새 상태, 아니면 null
  disconnect(userId: string): PresenceStatus | null
  setAway(userId: string): PresenceStatus | null
  setActive(userId: string): PresenceStatus | null
  snapshot(): Record<string, Exclude<PresenceStatus, 'offline'>>
}
```

  - `app.presence: PresenceTracker` 데코레이트, 상태 변화 시 `io.emit(RT.presenceChanged, { userId, status })` 전체 브로드캐스트(내부 도구 규모)
  - 클라 → 서버 이벤트: `'presence:away'` / `'presence:active'`
  - `GET /api/presence` → `Record<userId, 'online'|'away'>` (오프라인은 목록에 없음)

- [ ] **Step 1: 트래커 단위 테스트 + 통합 테스트 작성** — `apps/server/test/presence.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Socket as ClientSocket } from 'socket.io-client'
import type { FastifyInstance } from 'fastify'
import { RT, type PresencePayload } from '@deuce/shared'
import { PresenceTracker } from '../src/realtime/presence.js'
import { makeTestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'
import { listen, wsConnect, waitForEvent } from './ws-helpers.js'

describe('PresenceTracker (unit)', () => {
  it('tracks multi-socket users correctly', () => {
    const p = new PresenceTracker()
    expect(p.connect('u1')).toBe('online')   // 첫 접속 → online
    expect(p.connect('u1')).toBeNull()       // 둘째 소켓 → 변화 없음
    expect(p.setAway('u1')).toBe('away')
    expect(p.setAway('u1')).toBeNull()       // 중복 away → 변화 없음
    expect(p.setActive('u1')).toBe('online')
    expect(p.disconnect('u1')).toBeNull()    // 소켓 1개 남음
    expect(p.disconnect('u1')).toBe('offline')
    expect(p.snapshot()).toEqual({})
  })
})

describe('presence integration', () => {
  let app: FastifyInstance | null = null
  const sockets: ClientSocket[] = []

  beforeEach(resetDb)
  afterEach(async () => {
    for (const s of sockets) s.close()
    sockets.length = 0
    if (app) await app.close()
    app = null
  })

  it('broadcasts online, away and offline transitions', async () => {
    const t = await makeTestApp()
    app = t.app
    const aCookie = await t.loginAs('a@goldenlabs.dev', 'A')
    const bCookie = await t.loginAs('b@goldenlabs.dev', 'B')
    const port = await listen(t.app)
    const bSocket = await wsConnect(port, bCookie)
    sockets.push(bSocket)

    const onlineWait = waitForEvent<PresencePayload>(bSocket, RT.presenceChanged)
    const aSocket = await wsConnect(port, aCookie)
    sockets.push(aSocket)
    const online = await onlineWait
    expect(online.status).toBe('online')

    const awayWait = waitForEvent<PresencePayload>(bSocket, RT.presenceChanged)
    aSocket.emit('presence:away')
    expect((await awayWait).status).toBe('away')

    const snap = await t.app.inject({
      method: 'GET', url: '/api/presence', headers: { cookie: bCookie },
    })
    expect(snap.statusCode).toBe(200)
    expect(Object.values(snap.json() as Record<string, string>)).toContain('away')

    const offlineWait = waitForEvent<PresencePayload>(bSocket, RT.presenceChanged)
    aSocket.close()
    expect((await offlineWait).status).toBe('offline')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd apps/server && pnpm vitest run test/presence.test.ts`
Expected: FAIL — PresenceTracker 모듈 없음

- [ ] **Step 3: 구현**

`apps/server/src/realtime/presence.ts`:

```ts
export type PresenceStatus = 'online' | 'away' | 'offline'

interface Entry {
  sockets: number
  away: boolean
}

export class PresenceTracker {
  private readonly entries = new Map<string, Entry>()

  connect(userId: string): PresenceStatus | null {
    const cur = this.entries.get(userId)
    if (cur) {
      cur.sockets += 1
      return null
    }
    this.entries.set(userId, { sockets: 1, away: false })
    return 'online'
  }

  disconnect(userId: string): PresenceStatus | null {
    const cur = this.entries.get(userId)
    if (!cur) return null
    cur.sockets -= 1
    if (cur.sockets > 0) return null
    this.entries.delete(userId)
    return 'offline'
  }

  setAway(userId: string): PresenceStatus | null {
    const cur = this.entries.get(userId)
    if (!cur || cur.away) return null
    cur.away = true
    return 'away'
  }

  setActive(userId: string): PresenceStatus | null {
    const cur = this.entries.get(userId)
    if (!cur || !cur.away) return null
    cur.away = false
    return 'online'
  }

  snapshot(): Record<string, Exclude<PresenceStatus, 'offline'>> {
    const out: Record<string, 'online' | 'away'> = {}
    for (const [userId, e] of this.entries) out[userId] = e.away ? 'away' : 'online'
    return out
  }
}
```

`apps/server/src/realtime/io.ts` — 수정: import에 `PresenceTracker`와 `RT`(`@deuce/shared`) 추가, `setupRealtime` 안에서 `const presence = new PresenceTracker()` 생성, connection 핸들러를 다음으로 확장:

```ts
  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string
    await socket.join(`user:${userId}`)
    const memberships = await prisma.conversationMember.findMany({ where: { userId } })
    await socket.join(memberships.map((m) => `convo:${m.conversationId}`))

    const onlineChange = presence.connect(userId)
    if (onlineChange) io.emit(RT.presenceChanged, { userId, status: onlineChange })

    socket.on('presence:away', () => {
      const change = presence.setAway(userId)
      if (change) io.emit(RT.presenceChanged, { userId, status: change })
    })
    socket.on('presence:active', () => {
      const change = presence.setActive(userId)
      if (change) io.emit(RT.presenceChanged, { userId, status: change })
    })
    socket.on('disconnect', () => {
      const change = presence.disconnect(userId)
      if (change) io.emit(RT.presenceChanged, { userId, status: change })
    })
  })

  app.decorate('presence', presence)
```

FastifyInstance 타입 확장에 `presence: PresenceTracker` 추가 (io.ts의 declare module 블록).

`apps/server/src/routes/presence.ts`:

```ts
import type { FastifyPluginAsync } from 'fastify'

export const presenceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.get('/presence', async (req) => {
    void req
    return app.presence.snapshot()
  })
}
```

`apps/server/src/app.ts` — `setupRealtime(app, config)` **다음에** 등록(데코레이트 순서):

```ts
import { presenceRoutes } from './routes/presence.js'
```

```ts
  await app.register(presenceRoutes, { prefix: '/api' })
```

- [ ] **Step 4: 전체 테스트·타입체크 통과**

Run: `cd apps/server && pnpm test && pnpm typecheck`

- [ ] **Step 5: Commit**

```bash
git add apps/server/src apps/server/test
git commit -m "feat: add in-memory presence with realtime broadcasts and snapshot api"
```

---

### Task 6: 파일 첨부 — 서버 경유 업로드·다운로드·공유 탭

**Files:**
- Create: `apps/server/src/storage.ts`, `apps/server/src/routes/attachments.ts`, `packages/shared/src/attachment.ts`
- Modify: `apps/server/src/config.ts`, `apps/server/src/app.ts`, `apps/server/src/serializers.ts`, `packages/shared/src/message.ts`, `packages/shared/src/index.ts`, `apps/server/test/setup.ts`, `.gitignore`, `apps/server/.env.example`, `docs/design/2026-08-29-deuce-v1-spec.md`(§3 문구)
- Test: `apps/server/test/attachments.test.ts`

**Interfaces:**
- Consumes: `isMember`, `messageInclude`/`toMessageDto`, `RT.messageNew`, `makeTestApp`/`loginAs`, `listen`
- Produces:
  - `FileStorage` 인터페이스 + `LocalDiskStorage(baseDir)` (`src/storage.ts`):

```ts
import type { Readable } from 'node:stream'

export interface FileStorage {
  save(objectKey: string, stream: Readable): Promise<{ size: number }>
  createReadStream(objectKey: string): Promise<Readable>
}
```

  - `POST /api/conversations/:id/attachments` — multipart(`file` 필수, `body` 캡션 선택 ≤4000자) → 201 MessageDto(attachments 포함) + `message.new` 발행. 한도 초과 시 413
  - `GET /api/attachments/:id` — 멤버만(404 통일), 스트림 응답(content-type·content-disposition)
  - `GET /api/conversations/:id/attachments` — 공유 탭 목록, 최신순, 삭제 메시지 제외 → `SharedFile[]`
  - `@deuce/shared`: `AttachmentDtoSchema {id,fileName,size,contentType}`, `SharedFileSchema {…, messageId, createdAt}`; **MessageDto에 `attachments: AttachmentDto[]` 필드 추가**
  - config 추가: `uploadDir`(기본 `./uploads`), `maxUploadBytes`(기본 26214400)

- [ ] **Step 1: 의존성·설정·스키마**

Run: `cd apps/server && pnpm add @fastify/multipart`

`apps/server/src/config.ts` — EnvSchema에 추가:

```ts
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(26214400),
```

AppConfig에 `uploadDir: string`·`maxUploadBytes: number` 추가, loadConfig 반환에 `uploadDir: parsed.UPLOAD_DIR, maxUploadBytes: parsed.MAX_UPLOAD_BYTES` 추가.

`apps/server/test/setup.ts`에 추가(테스트 업로드 격리):

```ts
process.env.UPLOAD_DIR = './uploads-test'
```

`.gitignore`에 두 줄 추가: `uploads/`, `uploads-test/`

`apps/server/.env.example` 마지막에 추가:

```
# 파일 첨부 저장 위치(로컬 드라이버)와 업로드 한도(bytes)
UPLOAD_DIR=./uploads
MAX_UPLOAD_BYTES=26214400
```

`packages/shared/src/attachment.ts`:

```ts
import { z } from 'zod'

export const AttachmentDtoSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  size: z.number().int(),
  contentType: z.string(),
})
export type AttachmentDto = z.infer<typeof AttachmentDtoSchema>

export const SharedFileSchema = AttachmentDtoSchema.extend({
  messageId: z.string(),
  createdAt: z.string(),
})
export type SharedFile = z.infer<typeof SharedFileSchema>
```

`packages/shared/src/message.ts` — import에 `AttachmentDtoSchema` 추가(`./attachment.js`), `MessageDtoSchema`의 `mentions` 아래에 `attachments: z.array(AttachmentDtoSchema),` 추가.

`packages/shared/src/index.ts`에 추가:

```ts
export { AttachmentDtoSchema, type AttachmentDto, SharedFileSchema, type SharedFile } from './attachment.js'
```

`apps/server/src/serializers.ts` — `messageInclude`에 `attachments: true,` 추가, `toMessageDto` 반환 객체의 `mentions` 아래에:

```ts
    attachments: m.attachments.map((a) => ({
      id: a.id, fileName: a.fileName, size: a.size, contentType: a.contentType,
    })),
```

- [ ] **Step 2: 실패하는 테스트 작성** — `apps/server/test/attachments.test.ts`

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { MessageDtoSchema, SharedFileSchema, type UserDto } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'
import { listen } from './ws-helpers.js'

interface Ctx extends TestApp {
  aCookie: string
  bCookie: string
  convoId: string
  port: number
}

describe('attachments', () => {
  let app: FastifyInstance | null = null

  beforeEach(resetDb)
  afterEach(async () => {
    if (app) await app.close()
    app = null
  })

  async function setup(): Promise<Ctx> {
    const t = await makeTestApp()
    app = t.app
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
    const port = await listen(t.app)
    return { ...t, aCookie, bCookie, convoId: (convo.json() as { id: string }).id, port }
  }

  it('uploads a file as a message and lets members download it', async () => {
    const c = await setup()
    const bytes = new TextEncoder().encode('첨부 파일 내용입니다')
    const fd = new FormData()
    fd.append('file', new Blob([bytes], { type: 'text/plain' }), '메모.txt')
    fd.append('body', '파일 공유합니다')

    const up = await fetch(`http://127.0.0.1:${c.port}/api/conversations/${c.convoId}/attachments`, {
      method: 'POST', headers: { cookie: c.aCookie }, body: fd,
    })
    expect(up.status).toBe(201)
    const dto = MessageDtoSchema.parse(await up.json())
    expect(dto.body).toBe('파일 공유합니다')
    expect(dto.attachments).toHaveLength(1)
    expect(dto.attachments[0]).toMatchObject({
      fileName: '메모.txt', contentType: 'text/plain', size: bytes.byteLength,
    })

    const down = await fetch(`http://127.0.0.1:${c.port}/api/attachments/${dto.attachments[0]!.id}`, {
      headers: { cookie: c.bCookie },
    })
    expect(down.status).toBe(200)
    expect(await down.text()).toBe('첨부 파일 내용입니다')
    expect(down.headers.get('content-type')).toContain('text/plain')

    const list = await c.app.inject({
      method: 'GET', url: `/api/conversations/${c.convoId}/attachments`,
      headers: { cookie: c.bCookie },
    })
    const files = (list.json() as unknown[]).map((x) => SharedFileSchema.parse(x))
    expect(files).toHaveLength(1)
    expect(files[0]!.fileName).toBe('메모.txt')
  })

  it('hides attachments from non-members and respects the size limit', async () => {
    const c = await setup()
    const fd = new FormData()
    fd.append('file', new Blob(['x'], { type: 'text/plain' }), 'a.txt')
    const up = await fetch(`http://127.0.0.1:${c.port}/api/conversations/${c.convoId}/attachments`, {
      method: 'POST', headers: { cookie: c.aCookie }, body: fd,
    })
    const dto = MessageDtoSchema.parse(await up.json())
    const attId = dto.attachments[0]!.id

    const cCookie = await c.loginAs('c@goldenlabs.dev', 'C')
    const forbidden = await fetch(`http://127.0.0.1:${c.port}/api/attachments/${attId}`, {
      headers: { cookie: cCookie },
    })
    expect(forbidden.status).toBe(404)

    const big = new Uint8Array(26214400 + 1024)
    const bigFd = new FormData()
    bigFd.append('file', new Blob([big]), 'big.bin')
    const tooBig = await fetch(`http://127.0.0.1:${c.port}/api/conversations/${c.convoId}/attachments`, {
      method: 'POST', headers: { cookie: c.aCookie }, body: bigFd,
    })
    expect(tooBig.status).toBe(413)
  })
})
```

- [ ] **Step 3: 실패 확인**

Run: `cd apps/server && pnpm vitest run test/attachments.test.ts`
Expected: FAIL — 라우트 404 (typecheck는 shared·serializers 변경까지 끝나야 통과)

- [ ] **Step 4: 구현**

`apps/server/src/storage.ts`:

```ts
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'

export interface FileStorage {
  save(objectKey: string, stream: Readable): Promise<{ size: number }>
  createReadStream(objectKey: string): Promise<Readable>
}

const KEY_PATTERN = /^[0-9a-f-]{36}(\.[A-Za-z0-9]{1,10})?$/

function assertSafeKey(objectKey: string): void {
  if (!KEY_PATTERN.test(objectKey)) throw new Error(`invalid object key: ${objectKey}`)
}

export class LocalDiskStorage implements FileStorage {
  constructor(private readonly baseDir: string) {}

  async save(objectKey: string, stream: Readable): Promise<{ size: number }> {
    assertSafeKey(objectKey)
    await mkdir(this.baseDir, { recursive: true })
    const path = join(this.baseDir, objectKey)
    await pipeline(stream, createWriteStream(path))
    const info = await stat(path)
    return { size: info.size }
  }

  async createReadStream(objectKey: string): Promise<Readable> {
    assertSafeKey(objectKey)
    return createReadStream(join(this.baseDir, objectKey))
  }
}
```

`apps/server/src/routes/attachments.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import type { FastifyPluginAsync } from 'fastify'
import { RT, type SharedFile } from '@deuce/shared'
import { prisma } from '../db.js'
import { isMember } from '../domain/conversations.js'
import { messageInclude, toMessageDto } from '../serializers.js'
import type { FileStorage } from '../storage.js'

export interface AttachmentDeps {
  storage: FileStorage
}

export const attachmentRoutes: FastifyPluginAsync<AttachmentDeps> = async (app, deps) => {
  app.addHook('preHandler', app.authenticate)

  app.post('/conversations/:id/attachments', async (req, reply) => {
    const { id } = req.params as { id: string }
    const me = req.currentUser.id
    if (!(await isMember(id, me))) return reply.code(403).send({ error: 'not a member' })
    const data = await req.file()
    if (!data) return reply.code(400).send({ error: 'file required' })
    const captionField = data.fields['body']
    const caption =
      captionField && 'value' in captionField ? String(captionField.value).slice(0, 4000) : ''
    const objectKey = `${randomUUID()}${extname(data.filename).slice(0, 11)}`
    const { size } = await deps.storage.save(objectKey, data.file)
    if (data.file.truncated) {
      return reply.code(413).send({ error: 'file too large' })
    }
    const created = await prisma.message.create({
      data: {
        conversationId: id,
        authorId: me,
        body: caption,
        attachments: {
          create: {
            objectKey,
            fileName: data.filename,
            size,
            contentType: data.mimetype,
          },
        },
      },
      include: messageInclude,
    })
    const dto = toMessageDto(created)
    app.io.to(`convo:${id}`).emit(RT.messageNew, dto)
    return reply.code(201).send(dto)
  })

  app.get('/attachments/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: { message: true },
    })
    if (
      !attachment ||
      attachment.message.deletedAt ||
      !(await isMember(attachment.message.conversationId, req.currentUser.id))
    ) {
      return reply.code(404).send({ error: 'attachment not found' })
    }
    const stream = await deps.storage.createReadStream(attachment.objectKey)
    reply.header('content-type', attachment.contentType)
    reply.header(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    )
    return reply.send(stream)
  })

  app.get('/conversations/:id/attachments', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!(await isMember(id, req.currentUser.id)))
      return reply.code(403).send({ error: 'not a member' })
    const rows = await prisma.attachment.findMany({
      where: { message: { conversationId: id, deletedAt: null } },
      include: { message: { select: { createdAt: true } } },
      orderBy: { message: { createdAt: 'desc' } },
    })
    const files: SharedFile[] = rows.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      size: a.size,
      contentType: a.contentType,
      messageId: a.messageId,
      createdAt: a.message.createdAt.toISOString(),
    }))
    return files
  })
}
```

`apps/server/src/app.ts` — import 추가:

```ts
import multipart from '@fastify/multipart'
import { LocalDiskStorage } from './storage.js'
import { attachmentRoutes } from './routes/attachments.js'
```

secure-session 등록 근처(라우트 등록 전)에 multipart 등록:

```ts
  await app.register(multipart, {
    limits: { fileSize: config.maxUploadBytes, files: 1 },
  })
```

라우트 등록부에 추가:

```ts
  await app.register(attachmentRoutes, {
    prefix: '/api',
    storage: new LocalDiskStorage(config.uploadDir),
  })
```

- [ ] **Step 5: 스펙 §3 문구 수정** — `docs/design/2026-08-29-deuce-v1-spec.md`

기존 줄:

```
- **파일 첨부**: GCS 서명 URL 업로드/다운로드. 대화방 '공유' 탭에서 모아보기
```

다음으로 교체:

```
- **파일 첨부**: 서버 경유 업로드/다운로드 + 스토리지 드라이버(개발: 로컬
  디스크, 운영: GCS — 계획 ⑥). 다운로드마다 멤버십 검사. 대화방 '공유'
  탭에서 모아보기 (2026-08-29 변경: 서명 URL 직행 대신 서버 경유 — 권한
  검사 일원화, 개발·운영 단일 흐름)
```

- [ ] **Step 6: 전체 테스트·양쪽 타입체크 통과 + 업로드 디렉터리 정리 확인**

Run: `cd apps/server && pnpm test && pnpm typecheck && cd ../../packages/shared && pnpm typecheck`
Run: `git status --short` — `uploads-test/`가 미추적으로 뜨지 않아야 함(.gitignore 확인)

- [ ] **Step 7: Commit**

```bash
git add apps/server/src apps/server/test apps/server/package.json apps/server/.env.example .gitignore packages/shared/src docs/design/2026-08-29-deuce-v1-spec.md pnpm-lock.yaml
git commit -m "feat: add server-mediated file attachments with local storage driver"
```

---

## Self-Review 결과

- **스펙 커버리지**: §5 이벤트 6종 전부 발행(핀은 message.updated로 통일 — Global Constraints에 명시), §3 프레즌스(자동 온라인/자리비움/오프라인 — away 전환은 클라 신호 기반, 자동 idle 감지는 계획 ④ 클라 소관), §3 파일 첨부·공유 탭(스펙 문구 수정 포함), 이월 5건(타인 제거·204→DTO·삭제 가드·커서 정합·ReadState 정책 결정) 전부 태스크 배정. 알림(§3 멘션·알림)의 데스크톱/웹 표시 자체는 계획 ④·⑤ 소관 — 서버는 이벤트로 재료 제공.
- **플레이스홀더 스캔**: TBD/TODO 없음. cookie 타입 패키지 필요 여부(T2 Step 1)는 두 경로 모두 실행 가능한 지시로 명시.
- **타입 일관성**: `RT`·`PresencePayload`·`ReadAdvancedPayload`(T3 정의 → T4·T5 사용), `listen`/`wsConnect`/`waitForEvent`(T2 → T3·T4·T5·T6), `FileStorage`/`LocalDiskStorage`(T6 내부), `MessageDto.attachments`(T6에서 스키마·직렬화기·테스트 동시 갱신 — 기존 테스트는 배열 자동 포함으로 호환), read 응답 `{conversationId, lastReadMessageId}`(T1 정의 → T3 테스트 사용) 대조 완료.
- **주의 전달**: T1이 기존 테스트(message-actions·conversation-admin)를 새 계약으로 전환하므로, T1 완료 전까지는 스위트가 RED — T1 Step 1·2를 같은 태스크에서 처리하는 이유.
