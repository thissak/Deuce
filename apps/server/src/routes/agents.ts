import type { FastifyPluginAsync } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { z } from 'zod'
import { RT } from '@deuce/shared'
import { prisma } from '../db.js'
import { authenticateAgent } from '../domain/agents.js'
import { messageInclude, toMessageDto } from '../serializers.js'
import { requestTrace } from '../observability.js'
import type { AppConfig } from '../config.js'

type Agent = NonNullable<Awaited<ReturnType<typeof authenticateAgent>>>

/** AI 세션용 API. 쿠키 세션과 섞지 않고 요청마다 키·방 권한을 DB에서 다시 확인한다. */
export const agentAccessRoutes: FastifyPluginAsync<{ config: AppConfig }> = async (app, opts) => {
  const identities = new WeakMap<object, Agent>()
  app.addHook('preHandler', async (req, reply) => {
    const a = await authenticateAgent(req.headers.authorization, opts.config)
    if (!a) return reply.code(401).send({ error: 'invalid agent credential' })
    identities.set(req, a)
    reply.header('cache-control', 'no-store')
    req.log.info({ event: 'agent.access', agentId: a.id, conversationId: a.conversationId }, 'agent access')
  })
  await app.register(rateLimit, { global: false })
  const limited = { preHandler: app.rateLimit({ max: 120, timeWindow: '1 minute', keyGenerator: (req) => identities.get(req)!.id }) }
  // AI에는 다른 사용자의 이메일을 주지 않는다.
  const person = (u: { id: string; name: string; isAgent?: boolean }) => ({ id: u.id, name: u.name, isAgent: u.isAgent ?? false })

  app.get('/conversation', limited, async (req) => {
    const a = identities.get(req)!
    const c = await prisma.conversation.findUniqueOrThrow({ where: { id: a.conversationId }, include: { members: { include: { user: true } } } })
    return { id: c.id, title: c.title, type: c.type, agentId: a.id, members: c.members.map((m) => person(m.user)) }
  })

  app.get('/messages', limited, async (req, reply) => {
    const a = identities.get(req)!
    const q = z.object({ after: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }).safeParse(req.query)
    if (!q.success) return reply.code(400).send({ error: 'invalid query' })
    const conversationId = a.conversationId
    let rows
    if (q.data.after) {
      const cursor = await prisma.message.findFirst({ where: { id: q.data.after, conversationId } })
      if (!cursor) return reply.code(400).send({ error: 'unknown after message' })
      rows = await prisma.message.findMany({ where: { conversationId,
        OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: q.data.limit, include: messageInclude })
    } else {
      rows = (await prisma.message.findMany({ where: { conversationId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: q.data.limit, include: messageInclude })).reverse()
    }
    const items = rows.map((m) => ({ ...toMessageDto(m), author: person(m.author) }))
    return { items, lastMessageId: items.at(-1)?.id ?? q.data.after ?? null }
  })

  app.post('/messages', limited, async (req, reply) => {
    const a = identities.get(req)!
    const p = z.object({ body: z.string().trim().min(1).max(4000), replyToId: z.string().uuid().optional() }).strict().safeParse(req.body)
    if (!p.success) return reply.code(400).send({ error: 'invalid message' })
    const conversationId = a.conversationId
    if (p.data.replyToId && !await prisma.message.findFirst({ where: { id: p.data.replyToId, conversationId } }))
      return reply.code(400).send({ error: 'unknown reply target' })
    const m = await prisma.message.create({ data: { conversationId, authorId: a.userId,
      body: p.data.body, replyToId: p.data.replyToId }, include: messageInclude })
    const trace = requestTrace.getStore()
    if (trace) trace.messageId = m.id
    app.io.to(`convo:${conversationId}`).emit(RT.messageNew, toMessageDto(m))
    req.log.info({ event: 'agent.message', agentId: a.id, messageId: m.id }, 'agent message posted')
    return reply.code(201).send({ id: m.id, conversationId, createdAt: m.createdAt.toISOString() })
  })
}
