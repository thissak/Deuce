import { readdir } from 'node:fs/promises'
import { beforeEach, describe, expect, it } from 'vitest'
import { ConversationDetailSchema, MessagePageSchema } from '@deuce/shared'
import { makeTestApp, type TestApp } from './api-helpers.js'
import { resetDb } from './helpers.js'
import { listen } from './ws-helpers.js'

interface Ctx extends TestApp {
  aCookie: string
  bCookie: string
  dmId: string
}

async function setupDm(): Promise<Ctx> {
  const t = await makeTestApp()
  const aCookie = await t.loginAs('a@goldenlabs.dev', 'A')
  const bCookie = await t.loginAs('b@goldenlabs.dev', 'B')
  const users = (
    await t.app.inject({ method: 'GET', url: '/api/users', headers: { cookie: aCookie } })
  ).json() as Array<{ id: string; email: string }>
  const other = users.find((u) => u.email === 'b@goldenlabs.dev')!
  const dm = await t.app.inject({
    method: 'POST', url: '/api/conversations', headers: { cookie: aCookie },
    payload: { type: 'dm', otherUserId: other.id },
  })
  return { ...t, aCookie, bCookie, dmId: (dm.json() as { id: string }).id }
}

describe('plan4 contract', () => {
  beforeEach(resetDb)

  it('대화방 상세가 ConversationDetailSchema로 파싱된다 (고정 메시지 포함)', async () => {
    const t = await setupDm()
    const posted = await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.dmId}/messages`, headers: { cookie: t.aCookie },
      payload: { body: '고정할 메시지' },
    })
    const messageId = (posted.json() as { id: string }).id
    await t.app.inject({ method: 'PUT', url: `/api/messages/${messageId}/pin`, headers: { cookie: t.aCookie } })
    const detail = await t.app.inject({ method: 'GET', url: `/api/conversations/${t.dmId}`, headers: { cookie: t.aCookie } })
    expect(detail.statusCode).toBe(200)
    const parsed = ConversationDetailSchema.parse(detail.json())
    expect(parsed.pinnedMessage?.id).toBe(messageId)
  })

  it('메시지 목록이 MessagePageSchema로 파싱된다', async () => {
    const t = await setupDm()
    await t.app.inject({
      method: 'POST', url: `/api/conversations/${t.dmId}/messages`, headers: { cookie: t.aCookie },
      payload: { body: '안녕하세요' },
    })
    const list = await t.app.inject({ method: 'GET', url: `/api/conversations/${t.dmId}/messages`, headers: { cookie: t.aCookie } })
    const page = MessagePageSchema.parse(list.json())
    expect(page.items).toHaveLength(1)
    expect(page.nextCursor).toBeNull()
  })

  it('캡션 4001자는 400이고 저장 파일이 늘지 않는다 (4000자는 성공)', async () => {
    const t = await setupDm()
    const port = await listen(t.app)
    const before = (await readdir('./uploads-test').catch(() => [] as string[])).length

    const tooLong = new FormData()
    tooLong.append('file', new Blob(['hello']), 'a.txt')
    tooLong.append('body', 'x'.repeat(4001))
    const rejected = await fetch(`http://127.0.0.1:${port}/api/conversations/${t.dmId}/attachments`, {
      method: 'POST', headers: { cookie: t.aCookie }, body: tooLong,
    })
    expect(rejected.status).toBe(400)
    expect(((await rejected.json()) as { error: string }).error).toBe('invalid body')
    expect((await readdir('./uploads-test').catch(() => [] as string[])).length).toBe(before)

    const ok = new FormData()
    ok.append('file', new Blob(['hello']), 'a.txt')
    ok.append('body', 'x'.repeat(4000))
    const accepted = await fetch(`http://127.0.0.1:${port}/api/conversations/${t.dmId}/attachments`, {
      method: 'POST', headers: { cookie: t.aCookie }, body: ok,
    })
    expect(accepted.status).toBe(201)
    await t.app.close()
  })
})
