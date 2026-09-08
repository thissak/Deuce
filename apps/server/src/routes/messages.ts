import type { FastifyPluginAsync } from 'fastify'
import { Prisma, type AgentConnection } from '@prisma/client'
import { z } from 'zod'
import { RT } from '@deuce/shared'
import { prisma } from '../db.js'
import { isMember } from '../domain/conversations.js'
import { messageInclude, toMessageDto } from '../serializers.js'
import { requestTrace } from '../observability.js'
import { agentConversationWhere, isAgentActive } from '../domain/agents.js'
import type { AppConfig } from '../config.js'

const PostSchema = z.object({
  body: z.string().min(1).max(4000),
  replyToId: z.string().optional(),
  mentions: z.array(z.string()).max(20).default([]),
  clientMessageId: z.string().uuid().optional(),
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

export const messageRoutes: FastifyPluginAsync<{ config: AppConfig }> = async (app, { config }) => {
  app.addHook('preHandler', app.authenticate)

  app.post('/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string }
    const me = req.currentUser.id
    if (!(await isMember(id, me))) return reply.code(403).send({ error: 'not a member' })
    const parsed = PostSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' })
    const { body, replyToId, mentions } = parsed.data
    const previous = parsed.data.clientMessageId ? await prisma.message.findUnique({ where: { id: parsed.data.clientMessageId }, include: messageInclude }) : null
    if (previous) {
      if (previous.authorId !== me || previous.conversationId !== id || previous.body !== body || previous.replyToId !== (replyToId ?? null))
        return reply.code(409).send({ error: 'message id already used' })
      return reply.code(201).send(toMessageDto(previous))
    }
    if (replyToId) {
      const target = await prisma.message.findUnique({ where: { id: replyToId } })
      if (!target || target.conversationId !== id)
        return reply.code(400).send({ error: 'invalid replyToId' })
    }
    const targets: AgentConnection[] = []
    for (const uid of new Set(mentions)) {
      const a = await prisma.agentConnection.findUnique({ where: { userId: uid }, include: { owner: true } })
      if (a && !a.conversationId) {
        if (!isAgentActive(a, config) || !await prisma.conversation.count({ where: { AND: [{ id }, agentConversationWhere(a)] } }))
          return reply.code(400).send({ error: 'AI is not participating' })
        targets.push(a)
      } else if (!(await isMember(id, uid))) return reply.code(400).send({ error: 'mention must be a member' })
    }
    if (targets.length > 1) return reply.code(400).send({ error: 'mention one AI per request' })
    const target = targets[0]
    if (target && app.agentRuntime.status(target.id) !== 'READY') return reply.code(409).send({ error: 'AI is offline or busy' })
    if (target) await app.agentRuntime.expire({ agentId: target.id })
    let saved
    try {
      saved = await prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            id: parsed.data.clientMessageId,
            conversationId: id,
            authorId: me,
            body,
            replyToId: replyToId ?? null,
            mentions: { create: [...new Set(mentions)].map((mentionedUserId) => ({ mentionedUserId })) },
          },
          include: messageInclude,
        })
        const run = target ? await tx.agentRun.create({ data: { id: created.id, agentId: target.id, conversationId: id,
          requestedById: me, prompt: body, questionMessageId: created.id } }) : null
        return { created, run }
      })
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return reply.code(409).send({ error: 'request already in progress' })
      throw e
    }
    const { created, run } = saved
    if (run) app.agentRuntime.start(run)
    const dto = toMessageDto(created)
    const trace = requestTrace.getStore()
    if (trace) trace.messageId = created.id
    req.log.info({ event: 'message.persisted', traceId: trace?.traceId, messageId: created.id }, 'message persisted')
    app.io.to(`convo:${id}`).emit(RT.messageNew, dto)
    req.log.info({ event: 'message.emitted', traceId: trace?.traceId, messageId: created.id }, 'message emitted')
    return reply.code(201).send(dto)
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
    if (msg.system) return reply.code(403).send({ error: 'system message' })
    if (msg.deletedAt) return reply.code(400).send({ error: 'message deleted' })
    const parsed = z.object({ body: z.string().min(1).max(4000) }).safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' })
    const updated = await prisma.message.update({
      where: { id },
      data: { body: parsed.data.body, editedAt: new Date() },
      include: messageInclude,
    })
    const dto = toMessageDto(updated)
    app.io.to(`convo:${updated.conversationId}`).emit(RT.messageUpdated, dto)
    return reply.code(200).send(dto)
  })

  app.delete('/messages/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const msg = await memberMessage(id, req.currentUser.id)
    if (!msg) return reply.code(404).send({ error: 'message not found' })
    if (msg.authorId !== req.currentUser.id) return reply.code(403).send({ error: 'author only' })
    if (msg.system) return reply.code(403).send({ error: 'system message' })
    await prisma.message.update({ where: { id }, data: { deletedAt: new Date() } })
    const masked = await prisma.message.findUniqueOrThrow({ where: { id }, include: messageInclude })
    app.io.to(`convo:${masked.conversationId}`).emit(RT.messageDeleted, toMessageDto(masked))
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
    const dto = toMessageDto(updated)
    app.io.to(`convo:${updated.conversationId}`).emit(RT.reactionChanged, dto)
    return reply.code(200).send(dto)
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
    const dto = toMessageDto(updated)
    app.io.to(`convo:${updated.conversationId}`).emit(RT.reactionChanged, dto)
    return reply.code(200).send(dto)
  })

  app.put('/messages/:id/pin', async (req, reply) => {
    const { id } = req.params as { id: string }
    const msg = await memberMessage(id, req.currentUser.id)
    if (!msg) return reply.code(404).send({ error: 'message not found' })
    if (msg.deletedAt) return reply.code(400).send({ error: 'message deleted' })
    const updated = await prisma.message.update({
      where: { id }, data: { pinnedAt: new Date() }, include: messageInclude,
    })
    const dto = toMessageDto(updated)
    app.io.to(`convo:${updated.conversationId}`).emit(RT.messageUpdated, dto)
    return reply.code(200).send(dto)
  })

  app.delete('/messages/:id/pin', async (req, reply) => {
    const { id } = req.params as { id: string }
    const msg = await memberMessage(id, req.currentUser.id)
    if (!msg) return reply.code(404).send({ error: 'message not found' })
    const updated = await prisma.message.update({
      where: { id }, data: { pinnedAt: null }, include: messageInclude,
    })
    const dto = toMessageDto(updated)
    app.io.to(`convo:${updated.conversationId}`).emit(RT.messageUpdated, dto)
    return reply.code(200).send(dto)
  })
}
