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
