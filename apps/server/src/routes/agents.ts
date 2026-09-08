import type { FastifyPluginAsync, FastifyReply } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { z } from 'zod'
import { RT } from '@deuce/shared'
import { prisma } from '../db.js'
import { authenticateAgent, agentConversationWhere, type AgentIdentity } from '../domain/agents.js'
export { authenticateAgent } from '../domain/agents.js'
export { agentManagementRoutes } from './agent-management.js'
import { getConversationAgents } from './agent-management.js'
import { messageInclude, toMessageDto } from '../serializers.js'
import { requestTrace } from '../observability.js'
import type { AppConfig } from '../config.js'
import type { FileStorage } from '../storage.js'

const MAX_FILE = 5 * 1024 * 1024

export const agentAccessRoutes: FastifyPluginAsync<{ config: AppConfig; storage: FileStorage }> = async (app, opts) => {
  // 요청마다 DB에서 권한을 재검사한다. 세션·토큰 캐시나 인간 사용자 세션 위임은 없다.
  const identities = new WeakMap<object, AgentIdentity>()
  app.addHook('preHandler', async (req, reply) => {
    const a = await authenticateAgent(req.headers.authorization, opts.config)
    if (!a) return reply.code(401).send({ error: 'invalid agent credential' })
    identities.set(req, a)
    reply.header('cache-control', 'no-store')
    req.log.info({ event: 'agent.access', agentId: a.id, conversationId: a.conversationId }, 'agent access')
  })
  await app.register(rateLimit, { global: false })
  const limited = { preHandler: app.rateLimit({ max: 120, timeWindow: '1 minute', keyGenerator: (req) => identities.get(req)!.id }) }
  async function resolveConversation(a: AgentIdentity, requested: string | undefined, reply: FastifyReply) {
    const id = requested ?? a.conversationId
    if (!id) { reply.code(400).send({ error: 'conversationId required; use list_conversations first' }); return null }
    if (!await prisma.conversation.count({ where: { AND: [{ id }, agentConversationWhere(a)] } })) {
      reply.code(403).send({ error: 'conversation access denied' }); return null
    }
    return id
  }
  const targetSchema = z.object({ conversationId: z.string().uuid().optional() })
  const contextInclude = { members: { include: { user: true } } } as const
  type Context = NonNullable<Awaited<ReturnType<typeof context>>>
  const context = (id: string) => prisma.conversation.findUnique({ where: { id }, include: contextInclude })
  const view = (c: Context, a: AgentIdentity) => ({
    id: c.id, title: c.title, type: c.type,
    displayName: c.type === 'DM' ? (c.members.find((m) => !m.user.isAgent && m.userId !== a.ownerId)?.user.name ?? '(알 수 없음)') : (c.title ?? ''),
    members: c.members.map(({ user: u }) => ({ id: u.id, name: u.name, isAgent: u.isAgent })),
  })
  app.get('/conversations', limited, async (req, reply) => {
    const a = identities.get(req)!
    const p = z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(50) }).safeParse(req.query)
    if (!p.success) return reply.code(400).send({ error: 'invalid query' })
    const rooms = await prisma.conversation.findMany({
      where: { AND: [agentConversationWhere(a), ...(p.data.cursor ? [{ id: { gt: p.data.cursor } }] : [])] },
      include: contextInclude, orderBy: { id: 'asc' }, take: p.data.limit,
    })
    return { items: rooms.map((c) => view(c, a)), nextCursor: rooms.length === p.data.limit ? rooms.at(-1)!.id : null }
  })
  app.get('/channel', limited, async (req, reply) => {
    const a = identities.get(req)!
    const p = targetSchema.safeParse(req.query)
    if (!p.success) return reply.code(400).send({ error: 'invalid query' })
    const id = await resolveConversation(a, p.data.conversationId, reply)
    if (!id) return
    const c = await context(id)
    if (!c) return reply.code(404).send({ error: 'conversation not found' })
    // AI에 다른 사용자의 이메일은 제공하지 않는다.
    const agents = (await getConversationAgents(id, a.ownerId, opts.config, app.agentRuntime)).filter((agent) => agent.participating)
    return { ...view(c, a), agentId: a.id,
      members: [
        ...c.members.filter((m) => !m.user.isAgent).map(({ user: u }) => ({ id: u.id, name: u.name, isAgent: false })),
        ...agents.map((agent) => ({ id: agent.userId, name: agent.name, isAgent: true, ownerName: agent.ownerName })),
      ],
    }
  })
  app.get('/messages', limited, async (req, reply) => {
    const a = identities.get(req)!
    const q = targetSchema.extend({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(50),
      query: z.string().trim().min(1).max(200).optional() }).safeParse(req.query)
    if (!q.success) return reply.code(400).send({ error: 'invalid query' })
    const conversationId = await resolveConversation(a, q.data.conversationId, reply)
    if (!conversationId) return
    const cursor = q.data.cursor ? await prisma.message.findFirst({ where: { id: q.data.cursor, conversationId } }) : null
    if (q.data.cursor && !cursor) return reply.code(400).send({ error: 'invalid cursor' })
    const items = await prisma.message.findMany({ where: { conversationId,
      ...(q.data.query ? { deletedAt: null, body: { contains: q.data.query.replace(/[\\%_]/g, (ch) => `\\${ch}`), mode: 'insensitive' } } : {}),
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
    }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: q.data.limit, include: messageInclude })
    return { items: items.map((m) => {
      const dto = toMessageDto(m)
      return { ...dto, author: { id: dto.author.id, name: dto.author.name, isAgent: dto.author.isAgent ?? false } }
    }), nextCursor: items.length === q.data.limit ? items.at(-1)!.id : null }
  })
  app.post('/messages', limited, async (req, reply) => {
    const a = identities.get(req)!
    const p = targetSchema.extend({ body: z.string().trim().min(1).max(4000), replyToId: z.string().uuid().optional() }).strict().safeParse(req.body)
    if (!p.success) return reply.code(400).send({ error: 'invalid message' })
    const conversationId = await resolveConversation(a, p.data.conversationId, reply)
    if (!conversationId) return
    if (p.data.replyToId && !await prisma.message.findFirst({ where: { id: p.data.replyToId, conversationId } }))
      return reply.code(400).send({ error: 'invalid reply' })
    const m = await prisma.message.create({ data: { conversationId, authorId: a.userId,
      body: p.data.body, replyToId: p.data.replyToId }, include: messageInclude })
    const trace = requestTrace.getStore()
    if (trace) trace.messageId = m.id
    app.io.to(`convo:${conversationId}`).emit(RT.messageNew, toMessageDto(m))
    req.log.info({ event: 'agent.message', agentId: a.id, messageId: m.id }, 'agent message posted')
    return reply.code(201).send({ id: m.id, conversationId: m.conversationId, createdAt: m.createdAt.toISOString() })
  })
  app.get('/attachments/:attachmentId', limited, async (req, reply) => {
    const a = identities.get(req)!
    const p = targetSchema.safeParse(req.query)
    if (!p.success) return reply.code(400).send({ error: 'invalid query' })
    const conversationId = await resolveConversation(a, p.data.conversationId, reply)
    if (!conversationId) return
    const { attachmentId } = req.params as { attachmentId: string }
    const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId,
      message: { conversationId, deletedAt: null } } })
    if (!attachment) return reply.code(404).send({ error: 'attachment not found' })
    if (attachment.size > MAX_FILE) return reply.code(413).send({ error: 'MCP file limit is 5 MiB' })
    const stream = await opts.storage.createReadStream(attachment.objectKey)
    const chunks: Buffer[] = []; let size = 0
    for await (const chunk of stream) {
      const b = Buffer.from(chunk); size += b.length
      if (size > MAX_FILE) { stream.destroy(); return reply.code(413).send({ error: 'MCP file limit is 5 MiB' }) }
      chunks.push(b)
    }
    return { id: attachment.id, fileName: attachment.fileName, mimeType: attachment.contentType,
      base64: Buffer.concat(chunks).toString('base64') }
  })
}
