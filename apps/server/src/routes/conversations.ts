import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { RT } from '@deuce/shared'
import { prisma } from '../db.js'
import { isMember, summarizeConversation } from '../domain/conversations.js'
import { messageInclude, toMessageDto } from '../serializers.js'

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
    const convo = await prisma.conversation.findUniqueOrThrow({ where: { id } })
    if (convo.type !== 'GROUP') return reply.code(400).send({ error: 'group only' })
    await prisma.conversationMember.delete({
      where: { conversationId_userId: { conversationId: id, userId: me } },
    })
    return reply.code(204).send()
  })

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
    app.io.to(`convo:${id}`).emit(RT.readAdvanced, {
      conversationId: id,
      userId: me,
      lastReadMessageId: msg.id,
    })
    return reply.code(200).send({ conversationId: id, lastReadMessageId: msg.id })
  })
}
