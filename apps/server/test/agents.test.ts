import { beforeEach, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { makeTestApp } from './api-helpers.js'
import { resetDb, testDb } from './helpers.js'
import { LocalDiskStorage } from '../src/storage.js'
import { ConversationSummarySchema, SearchResultSchema } from '@deuce/shared'

beforeEach(resetDb)
async function setup() {
  const { app, loginAs } = await makeTestApp()
  const owner = await loginAs('a@goldenlabs.dev')
  const peer = await loginAs('b@goldenlabs.dev')
  const outsider = await loginAs('c@goldenlabs.dev')
  const b = await testDb.user.findUniqueOrThrow({ where: { email: 'b@goldenlabs.dev' } })
  const channel = await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie: owner }, payload: { type: 'channel', title: '요구사항', memberIds: [b.id] } })
  expect(channel.statusCode).toBe(201)
  const c = ConversationSummarySchema.parse(channel.json())
  expect(c).toMatchObject({ type: 'CHANNEL', displayName: '요구사항' })
  const base = `/api/conversations/${c.id}`
  const created = await app.inject({ method: 'POST', url: `${base}/agents`, headers: { cookie: owner }, payload: { name: '감독님 AI' } })
  expect(created.statusCode).toBe(201)
  const { id, token } = created.json()
  return { app, owner, peer, outsider, c, base, id, token, authorization: `Bearer ${token}` }
}

it('채널 AI가 대화를 읽고 자기 이름으로 답장하며 사람 화면과 검색에도 나타난다', async () => {
  const { app, owner, peer, c, base, token, authorization } = await setup()
  try {
    const persisted = await testDb.agentConnection.findFirstOrThrow()
    expect(persisted.tokenHash).not.toBe(token)
    expect(persisted.tokenHash).toHaveLength(64)
    expect((await app.inject({ url: `${base}/agents`, headers: { cookie: peer } })).body).not.toContain(token)
    const context = await app.inject({ url: '/api/agent/channel', headers: { authorization } })
    expect(context.statusCode).toBe(200)
    expect(context.json()).toMatchObject({ id: c.id, title: '요구사항' })
    expect(context.body).not.toContain('@goldenlabs.dev')
    const human = await app.inject({ method: 'POST', url: `${base}/messages`, headers: { cookie: peer }, payload: { body: '채팅 요구사항을 조사해주세요' } })
    const posted = await app.inject({ method: 'POST', url: '/api/agent/messages', headers: { authorization }, payload: { body: '조사 결과입니다', replyToId: human.json().id } })
    expect(posted.statusCode).toBe(201)
    const history = await app.inject({ url: `${base}/messages`, headers: { cookie: owner } })
    expect(history.json().items[0]).toMatchObject({ body: '조사 결과입니다', author: { name: '감독님 AI', isAgent: true }, replyTo: { id: human.json().id } })
    const one = await app.inject({ url: '/api/agent/messages?limit=1', headers: { authorization } })
    expect(one.json().nextCursor).toBe(posted.json().id)
    const older = await app.inject({ url: `/api/agent/messages?cursor=${one.json().nextCursor}`, headers: { authorization } })
    expect(older.json().items).toHaveLength(1)
    expect(older.json().items[0].id).toBe(human.json().id)
    const search = await app.inject({ url: '/api/search?q=조사', headers: { cookie: owner } })
    expect(SearchResultSchema.array().parse(search.json())[0].conversationType).toBe('CHANNEL')
    expect((await app.inject({ url: '/api/agent/messages?query=결과', headers: { authorization } })).json().items).toHaveLength(1)
    expect((await app.inject({ url: '/api/users', headers: { cookie: owner } })).json().every((u: any) => !u.isAgent)).toBe(true)
  } finally { await app.close() }
})

it('다른 채널·인간 세션·회수·만료·소유자 탈퇴의 접근 경계를 지킨다', async () => {
  const { app, owner, outsider, base, id, authorization, c } = await setup()
  try {
    expect((await app.inject({ url: '/api/agent/channel', headers: { cookie: owner } })).statusCode).toBe(401)
    expect((await app.inject({ url: '/api/users', headers: { authorization } })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: `${base}/agents`, headers: { cookie: outsider }, payload: { name: '침입' } })).statusCode).toBe(403)
    const human = await testDb.user.findUniqueOrThrow({ where: { email: 'c@goldenlabs.dev' } })
    const other = await testDb.conversation.create({ data: { type: 'CHANNEL', title: '다른 방' } })
    const secret = await testDb.message.create({ data: { conversationId: other.id, authorId: human.id, body: 'OTHER_CHANNEL_SECRET' } })
    expect((await app.inject({ url: '/api/agent/messages', headers: { authorization } })).body).not.toContain(secret.body)
    expect((await app.inject({ url: `/api/agent/messages?cursor=${secret.id}`, headers: { authorization } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: '/api/agent/messages', headers: { authorization }, payload: { body: 'reply', replyToId: secret.id } })).statusCode).toBe(400)
    const a = await testDb.agentConnection.findUniqueOrThrow({ where: { id } })
    await testDb.agentConnection.update({ where: { id }, data: { expiresAt: new Date(0) } })
    expect((await app.inject({ url: '/api/agent/channel', headers: { authorization } })).statusCode).toBe(401)
    await testDb.agentConnection.update({ where: { id }, data: { expiresAt: new Date(Date.now() + 86400_000) } })
    await testDb.conversationMember.delete({ where: { conversationId_userId: { conversationId: c.id, userId: a.ownerId } } })
    expect((await app.inject({ url: '/api/agent/channel', headers: { authorization } })).statusCode).toBe(401)
    await testDb.conversationMember.create({ data: { conversationId: c.id, userId: a.ownerId } })
    expect((await app.inject({ method: 'DELETE', url: `${base}/agents/${id}`, headers: { cookie: owner } })).statusCode).toBe(204)
    expect((await app.inject({ url: '/api/agent/channel', headers: { authorization } })).statusCode).toBe(401)
  } finally { await app.close() }
})

it('첨부는 같은 채널의 미삭제 파일만 제한 크기 안에서 읽는다', async () => {
  const { app, authorization, c } = await setup()
  const storage = new LocalDiskStorage(process.env.UPLOAD_DIR!)
  const key = `${randomUUID()}.txt`
  try {
    await storage.save(key, Readable.from(['요구사항 자료']))
    const author = await testDb.user.findFirstOrThrow({ where: { isAgent: false } })
    const m = await testDb.message.create({ data: { conversationId: c.id, authorId: author.id, body: '', attachments: { create: { objectKey: key, fileName: '요구사항.txt', contentType: 'text/plain', size: 19 } } }, include: { attachments: true } })
    const path = `/api/agent/attachments/${m.attachments[0]!.id}`
    const file = await app.inject({ url: path, headers: { authorization } })
    expect(file.statusCode).toBe(200)
    expect(Buffer.from(file.json().base64, 'base64').toString()).toBe('요구사항 자료')
    await testDb.attachment.update({ where: { id: m.attachments[0]!.id }, data: { size: 6 * 1024 * 1024 } })
    expect((await app.inject({ url: path, headers: { authorization } })).statusCode).toBe(413)
    await testDb.message.update({ where: { id: m.id }, data: { deletedAt: new Date() } })
    expect((await app.inject({ url: path, headers: { authorization } })).statusCode).toBe(404)
    const other = await testDb.conversation.create({ data: { type: 'CHANNEL' } })
    await testDb.message.update({ where: { id: m.id }, data: { deletedAt: null, conversationId: other.id } })
    expect((await app.inject({ url: path, headers: { authorization } })).statusCode).toBe(404)
  } finally { await storage.delete(key); await app.close() }
})

it('AI 검색의 퍼센트·밑줄·역슬래시를 리터럴로 찾는다', async () => {
  const { app, authorization, c, id } = await setup()
  try {
    const agent = await testDb.agentConnection.findUniqueOrThrow({ where: { id } })
    const bodies = ['100%', '1000', 'snake_case', 'snakeXcase', 'C:\\notes', 'C:notes']
    await testDb.message.createMany({ data: bodies.map((body) => ({ conversationId: c.id, authorId: agent.userId, body })) })
    for (const query of ['100%', 'snake_case', 'C:\\notes']) {
      const res = await app.inject({ url: `/api/agent/messages?query=${encodeURIComponent(query)}`, headers: { authorization } })
      expect(res.statusCode).toBe(200)
      expect(res.json().items.map((m: { body: string }) => m.body)).toEqual([query])
    }
  } finally { await app.close() }
})
