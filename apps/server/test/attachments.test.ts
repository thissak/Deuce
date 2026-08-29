import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
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

    const uploadDir = process.env.UPLOAD_DIR!
    const entries = await readdir(uploadDir)
    for (const entry of entries) {
      const info = await stat(join(uploadDir, entry))
      expect(info.size).toBeLessThan(26214400)
    }
  })
})
