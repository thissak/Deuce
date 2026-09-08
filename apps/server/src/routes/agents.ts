import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { z } from 'zod'
import { RT } from '@deuce/shared'
import { prisma } from '../db.js'
import { isMember, summarizeConversation } from '../domain/conversations.js'
import { messageInclude, toMessageDto } from '../serializers.js'
import { requestTrace } from '../observability.js'
import type { AppConfig } from '../config.js'
import type { FileStorage } from '../storage.js'

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const MAX_FILE = 5 * 1024 * 1024

export async function authenticateAgent(authorization: string | undefined, config: AppConfig) {
  const token = authorization?.match(/^Bearer (deuce_[A-Za-z0-9_-]{43})$/)?.[1]
  if (!token) return null
  const a = await prisma.agentConnection.findUnique({ where: { tokenHash: hashToken(token) }, include: { owner: true } })
  if (!a || a.revokedAt || a.expiresAt <= new Date() || !config.allowedEmails.includes(a.owner.email)
    || !(await isMember(a.conversationId, a.ownerId)) || !(await isMember(a.conversationId, a.userId))) return null
  return { userId: a.userId, conversationId: a.conversationId, agentId: a.id }
}

export const agentManagementRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)
  app.addHook('preHandler', async (req, reply) => {
    const { id } = req.params as { id: string }
    const channel = await prisma.conversation.findUnique({ where: { id } })
    if (!channel || channel.type !== 'CHANNEL' || !(await isMember(id, req.currentUser.id)))
      return reply.code(403).send({ error: 'channel member required' })
  })
  app.get('/conversations/:id/agents', async (req) => {
    const { id } = req.params as { id: string }
    const agents = await prisma.agentConnection.findMany({ where: { conversationId: id },
      include: { user: true, owner: true }, orderBy: { createdAt: 'desc' } })
    return agents.map((a) => ({ id: a.id, name: a.user.name, ownerName: a.owner.name,
      expiresAt: a.expiresAt.toISOString(), revoked: a.revokedAt !== null }))
  })
  app.post('/conversations/:id/agents', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({ name: z.string().trim().min(1).max(40) }).strict().safeParse(req.body)
    if (!body.success) return reply.code(400).send({ error: 'invalid agent name' })
    const token = `deuce_${randomBytes(32).toString('base64url')}`
    const userId = randomUUID()
    const agent = await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: userId, email: `${userId}@agents.deuce.invalid`, name: body.data.name, isAgent: true } })
      await tx.conversationMember.create({ data: { conversationId: id, userId } })
      return tx.agentConnection.create({ data: { conversationId: id, ownerId: req.currentUser.id,
        userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 90 * 86400_000) } })
    })
    app.io.to(`convo:${id}`).emit(RT.conversationUpdated, { conversationId: id })
    req.log.info({ event: 'agent.created', agentId: agent.id, conversationId: id, ownerId: req.currentUser.id }, 'agent created')
    return reply.header('cache-control', 'no-store').code(201).send({ id: agent.id, token, expiresAt: agent.expiresAt.toISOString() })
  })
  app.delete('/conversations/:id/agents/:agentId', async (req, reply) => {
    const { id, agentId } = req.params as { id: string; agentId: string }
    const agent = await prisma.agentConnection.findFirst({ where: { id: agentId, conversationId: id } })
    if (!agent) return reply.code(404).send({ error: 'agent not found' })
    await prisma.$transaction([
      prisma.agentConnection.update({ where: { id: agentId }, data: { revokedAt: new Date() } }),
      prisma.conversationMember.deleteMany({ where: { conversationId: id, userId: agent.userId } }),
    ])
    app.io.to(`convo:${id}`).emit(RT.conversationUpdated, { conversationId: id })
    req.log.info({ event: 'agent.revoked', agentId, conversationId: id }, 'agent revoked')
    return reply.code(204).send()
  })
}

export const agentAccessRoutes: FastifyPluginAsync<{ config: AppConfig; storage: FileStorage }> = async (app, opts) => {
  // 요청마다 DB에서 권한을 재검사한다. 세션·토큰 캐시나 인간 사용자 세션 위임은 없다.
  const identities = new WeakMap<object, { userId: string; conversationId: string; agentId: string }>()
  app.addHook('preHandler', async (req, reply) => {
    const a = await authenticateAgent(req.headers.authorization, opts.config)
    if (!a) return reply.code(401).send({ error: 'invalid agent credential' })
    identities.set(req, a)
    reply.header('cache-control', 'no-store')
    req.log.info({ event: 'agent.access', agentId: a.agentId, conversationId: a.conversationId }, 'agent access')
  })
  await app.register(rateLimit, { global: false })
  const limited = { preHandler: app.rateLimit({ max: 120, timeWindow: '1 minute', keyGenerator: (req) => identities.get(req)!.agentId }) }
  app.get('/channel', limited, async (req) => {
    const a = identities.get(req)!
    const c = await summarizeConversation(a.conversationId, a.userId)
    // AI에 다른 사용자의 이메일은 제공하지 않는다.
    return { id: c.id, title: c.title, type: c.type, agentId: a.agentId,
      members: c.members.map((u) => ({ id: u.id, name: u.name, isAgent: u.isAgent ?? false })) }
  })
  app.get('/messages', limited, async (req, reply) => {
    const a = identities.get(req)!
    const q = z.object({ cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(50),
      query: z.string().trim().min(1).max(200).optional() }).safeParse(req.query)
    if (!q.success) return reply.code(400).send({ error: 'invalid query' })
    const cursor = q.data.cursor ? await prisma.message.findFirst({ where: { id: q.data.cursor, conversationId: a.conversationId } }) : null
    if (q.data.cursor && !cursor) return reply.code(400).send({ error: 'invalid cursor' })
    const items = await prisma.message.findMany({ where: { conversationId: a.conversationId,
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
    const p = z.object({ body: z.string().trim().min(1).max(4000), replyToId: z.string().uuid().optional() }).strict().safeParse(req.body)
    if (!p.success) return reply.code(400).send({ error: 'invalid message' })
    if (p.data.replyToId && !await prisma.message.findFirst({ where: { id: p.data.replyToId, conversationId: a.conversationId } }))
      return reply.code(400).send({ error: 'invalid reply' })
    const m = await prisma.message.create({ data: { conversationId: a.conversationId, authorId: a.userId,
      body: p.data.body, replyToId: p.data.replyToId }, include: messageInclude })
    const trace = requestTrace.getStore()
    if (trace) trace.messageId = m.id
    app.io.to(`convo:${a.conversationId}`).emit(RT.messageNew, toMessageDto(m))
    req.log.info({ event: 'agent.message', agentId: a.agentId, messageId: m.id }, 'agent message posted')
    return reply.code(201).send({ id: m.id, conversationId: m.conversationId, createdAt: m.createdAt.toISOString() })
  })
  app.get('/attachments/:attachmentId', limited, async (req, reply) => {
    const a = identities.get(req)!
    const { attachmentId } = req.params as { attachmentId: string }
    const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId,
      message: { conversationId: a.conversationId, deletedAt: null } } })
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
