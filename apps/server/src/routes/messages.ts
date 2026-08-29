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

async function memberMessage(messageId: string, userId: string) {
  const msg = await prisma.message.findUnique({ where: { id: messageId } })
  if (!msg) return null
  return (await isMember(msg.conversationId, userId)) ? msg : null
}

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
    let cursor: { createdAt: Date; id: string } | null = null
    if (q.data.cursor) {
      const c = await prisma.message.findUnique({ where: { id: q.data.cursor } })
      if (!c || c.conversationId !== id) return reply.code(400).send({ error: 'invalid cursor' })
      cursor = { createdAt: c.createdAt, id: c.id }
    }
    const items = await prisma.message.findMany({
      where: {
        conversationId: id,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.data.limit,
      include: messageInclude,
    })
    return {
      items: items.map(toMessageDto),
      nextCursor: items.length === q.data.limit ? items[items.length - 1]!.id : null,
    }
  })

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
    if (msg.deletedAt) return reply.code(400).send({ error: 'message deleted' })
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
    const updated = await prisma.message.findUniqueOrThrow({
      where: { id }, include: messageInclude,
    })
    return reply.code(200).send(toMessageDto(updated))
  })

  app.delete('/messages/:id/reactions/:emoji', async (req, reply) => {
    const { id, emoji } = req.params as { id: string; emoji: string }
    const msg = await memberMessage(id, req.currentUser.id)
    if (!msg) return reply.code(404).send({ error: 'message not found' })
    await prisma.reaction.deleteMany({
      where: { messageId: id, userId: req.currentUser.id, emoji },
    })
    const updated = await prisma.message.findUniqueOrThrow({
      where: { id }, include: messageInclude,
    })
    return reply.code(200).send(toMessageDto(updated))
  })

  app.put('/messages/:id/pin', async (req, reply) => {
    const { id } = req.params as { id: string }
    const msg = await memberMessage(id, req.currentUser.id)
    if (!msg) return reply.code(404).send({ error: 'message not found' })
    if (msg.deletedAt) return reply.code(400).send({ error: 'message deleted' })
    const updated = await prisma.message.update({
      where: { id }, data: { pinnedAt: new Date() }, include: messageInclude,
    })
    return reply.code(200).send(toMessageDto(updated))
  })

  app.delete('/messages/:id/pin', async (req, reply) => {
    const { id } = req.params as { id: string }
    const msg = await memberMessage(id, req.currentUser.id)
    if (!msg) return reply.code(404).send({ error: 'message not found' })
    const updated = await prisma.message.update({
      where: { id }, data: { pinnedAt: null }, include: messageInclude,
    })
    return reply.code(200).send(toMessageDto(updated))
  })
}
