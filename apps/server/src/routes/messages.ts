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
