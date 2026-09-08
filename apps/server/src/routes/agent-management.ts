import { randomBytes, randomUUID } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { AgentScopeSchema, RT, type AgentScope } from '@deuce/shared'
import { prisma } from '../db.js'
import { isMember } from '../domain/conversations.js'
import { agentConversationWhere, hashAgentToken, isAgentActive } from '../domain/agents.js'
import type { AppConfig } from '../config.js'
import type { AgentRuntime } from '../realtime/agent-runtime.js'
import { messageInclude, toMessageDto } from '../serializers.js'

const include = { user: true, owner: true } as const
const nameSchema = z.string().trim().min(1).max(40)
type Agent = NonNullable<Awaited<ReturnType<typeof getAgent>>>
const getAgent = (id: string) => prisma.agentConnection.findUnique({ where: { id }, include })
const dto = (a: Agent, viewer: string, runtime?: AgentRuntime) => ({
  id: a.id, userId: a.userId, name: a.user.name, ownerName: a.owner.name, ownerId: a.ownerId,
  scope: a.scope, conversationId: a.conversationId,
  isDefault: a.owner.defaultAgentId === a.id,
  lastConnectedAt: a.lastConnectedAt?.toISOString() ?? null,
  runtime: a.revokedAt || a.expiresAt <= new Date() ? 'OFFLINE' : runtime?.status(a.id) ?? 'OFFLINE',
  expiresAt: a.expiresAt.toISOString(), revoked: a.revokedAt !== null, editable: a.ownerId === viewer,
})

export async function getConversationAgents(id: string, viewer: string, config: AppConfig, runtime?: AgentRuntime) {
  const room = await prisma.conversation.findUniqueOrThrow({ where: { id } })
  const candidates = await prisma.agentConnection.findMany({ where: { OR: [
    { conversationId: id },
    { conversationId: null, owner: { memberships: { some: { conversationId: id } } } },
  ] }, include: { ...include, exclusions: { where: { conversationId: id } }, grants: { where: { conversationId: id } } }, orderBy: { createdAt: 'asc' } })
  const results = await Promise.all(candidates.map(async (a) => ({
    ...dto(a, viewer, runtime), excluded: a.exclusions.length > 0 || a.scope === 'SELECTED' && a.grants.length === 0,
    scopeAllows: a.conversationId !== null || a.scope !== 'CHANNELS' || room.type === 'CHANNEL',
    participating: isAgentActive(a, config) && (await prisma.conversation.count({ where: { AND: [{ id }, agentConversationWhere(a)] } })) > 0,
  })))
  return results.filter((a) => a.editable || a.participating)
}

export const agentManagementRoutes: FastifyPluginAsync<{ config: AppConfig }> = async (app, { config }) => {
  app.addHook('preHandler', app.authenticate)
  app.addHook('preHandler', async (req, reply) => {
    const { id } = req.params as { id?: string }
    if (id && !await isMember(id, req.currentUser.id)) return reply.code(403).send({ error: 'conversation member required' })
  })

  async function notifyOwnerRooms(ownerId: string) {
    const rooms = await prisma.conversationMember.findMany({ where: { userId: ownerId }, select: { conversationId: true } })
    for (const { conversationId } of rooms) app.io.to(`convo:${conversationId}`).emit(RT.conversationUpdated, { conversationId })
  }

  async function create(ownerId: string, name: string, scope: AgentScope, conversationId: string | null = null) {
    const token = `deuce_${randomBytes(32).toString('base64url')}`
    const userId = randomUUID()
    const a = await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: userId, email: `${userId}@agents.deuce.invalid`, name, isAgent: true } })
      if (conversationId) await tx.conversationMember.create({ data: { conversationId, userId } })
      const created = await tx.agentConnection.create({ data: { conversationId, scope, ownerId, userId,
        tokenHash: hashAgentToken(token), expiresAt: new Date(Date.now() + 90 * 86400_000) } })
      if (!conversationId) await tx.user.updateMany({ where: { id: ownerId, defaultAgentId: null }, data: { defaultAgentId: created.id } })
      return created
    })
    await notifyOwnerRooms(ownerId)
    return { id: a.id, token, expiresAt: a.expiresAt.toISOString() }
  }

  async function revoke(a: Agent) {
    await prisma.$transaction(async (tx) => {
      await tx.agentConnection.update({ where: { id: a.id }, data: { revokedAt: new Date() } })
      await tx.user.updateMany({ where: { id: a.ownerId, defaultAgentId: a.id }, data: { defaultAgentId: null } })
      if (a.conversationId) await tx.conversationMember.deleteMany({ where: { conversationId: a.conversationId, userId: a.userId } })
    })
    await notifyOwnerRooms(a.ownerId)
    await app.agentRuntime.cancel(a.id)
  }

  app.get('/agents', async (req, reply) => {
    reply.header('cache-control', 'no-store')
    const agents = await prisma.agentConnection.findMany({ where: { ownerId: req.currentUser.id }, include, orderBy: { createdAt: 'asc' } })
    return agents.map((a) => dto(a, req.currentUser.id, app.agentRuntime))
  })
  app.post('/agents', async (req, reply) => {
    const p = z.object({ name: nameSchema, scope: AgentScopeSchema.default('SELECTED') }).strict().safeParse(req.body)
    if (!p.success) return reply.code(400).send({ error: 'invalid agent settings' })
    return reply.header('cache-control', 'no-store').code(201).send(await create(req.currentUser.id, p.data.name, p.data.scope))
  })
  app.patch('/agents/:agentId', async (req, reply) => {
    const { agentId } = req.params as { agentId: string }
    const a = await getAgent(agentId)
    if (!a || a.ownerId !== req.currentUser.id) return reply.code(404).send({ error: 'agent not found' })
    // 기존 키를 설정 변경만으로 다른 방에 접근시키지 않는다.
    if (a.conversationId || !isAgentActive(a, config)) return reply.code(400).send({ error: 'active personal agent required' })
    const p = z.object({ scope: AgentScopeSchema.optional(), isDefault: z.literal(true).optional() }).strict()
      .refine((value) => value.scope !== undefined || value.isDefault).safeParse(req.body)
    if (!p.success) return reply.code(400).send({ error: 'invalid agent settings' })
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "AgentConnection" WHERE id = ${a.id} FOR UPDATE`
      const current = await tx.agentConnection.findUniqueOrThrow({ where: { id: a.id }, include })
      if (!isAgentActive(current, config)) throw Object.assign(new Error('inactive AI'), { statusCode: 400 })
      if (p.data.scope) await tx.agentConnection.update({ where: { id: a.id }, data: { scope: p.data.scope } })
      if (p.data.isDefault) await tx.user.update({ where: { id: a.ownerId }, data: { defaultAgentId: a.id } })
    })
    if (p.data.scope) await app.agentRuntime.cancel(a.id)
    await notifyOwnerRooms(a.ownerId)
    return dto((await getAgent(a.id))!, req.currentUser.id, app.agentRuntime)
  })
  app.delete('/agents/:agentId', async (req, reply) => {
    const { agentId } = req.params as { agentId: string }
    const a = await getAgent(agentId)
    if (!a || a.ownerId !== req.currentUser.id) return reply.code(404).send({ error: 'agent not found' })
    await revoke(a)
    return reply.code(204).send()
  })

  app.get('/conversations/:id/agents', async (req, reply) => {
    reply.header('cache-control', 'no-store')
    const { id } = req.params as { id: string }
    return getConversationAgents(id, req.currentUser.id, config, app.agentRuntime)
  })
  app.put('/conversations/:id/agents/:agentId', async (req, reply) => {
    const { id, agentId } = req.params as { id: string; agentId: string }
    const a = await getAgent(agentId)
    if (!a || a.ownerId !== req.currentUser.id) return reply.code(404).send({ error: 'agent not found' })
    if (a.conversationId || !isAgentActive(a, config)) return reply.code(400).send({ error: 'active personal agent required' })
    const p = z.object({ excluded: z.boolean() }).strict().safeParse(req.body)
    if (!p.success) return reply.code(400).send({ error: 'invalid participation' })
    const notice = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "AgentConnection" WHERE id = ${agentId} FOR UPDATE`
      const current = await tx.agentConnection.findUniqueOrThrow({ where: { id: agentId }, include })
      if (!isAgentActive(current, config)) throw Object.assign(new Error('inactive AI'), { statusCode: 400 })
      if (current.scope === 'CHANNELS' && (await tx.conversation.findUniqueOrThrow({ where: { id } })).type !== 'CHANNEL')
        throw Object.assign(new Error('AI scope does not include this conversation'), { statusCode: 400 })
      const before = await tx.conversation.count({ where: { AND: [{ id }, agentConversationWhere(current)] } })
      if (p.data.excluded) {
        await tx.agentConversationExclusion.upsert({
          where: { agentId_conversationId: { agentId, conversationId: id } },
          create: { agentId, conversationId: id }, update: {},
        })
        await tx.agentConversationGrant.deleteMany({ where: { agentId, conversationId: id } })
      } else {
        await tx.agentConversationExclusion.deleteMany({ where: { agentId, conversationId: id } })
        if (current.scope === 'SELECTED') await tx.agentConversationGrant.upsert({
          where: { agentId_conversationId: { agentId, conversationId: id } },
          create: { agentId, conversationId: id }, update: {},
        })
      }
      const after = await tx.conversation.count({ where: { AND: [{ id }, agentConversationWhere(current)] } })
      if (Boolean(before) === Boolean(after)) return null
      return tx.message.create({ data: { conversationId: id, authorId: req.currentUser.id, system: true,
        body: `${req.currentUser.name}님이 ${current.user.name}${after ? '를 초대했습니다. 이 방의 대화와 자료를 공유합니다.' : '를 이 방에서 내보냈습니다.'}` }, include: messageInclude })
    })
    if (notice) app.io.to(`convo:${id}`).emit(RT.messageNew, toMessageDto(notice))
    if (p.data.excluded) await app.agentRuntime.cancel(agentId, id)
    app.io.to(`convo:${id}`).emit(RT.conversationUpdated, { conversationId: id })
    return { agentId, conversationId: id, excluded: p.data.excluded }
  })

  // 이전 앱/연결의 방 전용 발급·회수 계약을 유지한다.
  app.post('/conversations/:id/agents', async (req, reply) => {
    const { id } = req.params as { id: string }
    const room = await prisma.conversation.findUniqueOrThrow({ where: { id } })
    if (room.type !== 'CHANNEL') return reply.code(400).send({ error: 'register a personal agent in settings' })
    const p = z.object({ name: nameSchema }).strict().safeParse(req.body)
    if (!p.success) return reply.code(400).send({ error: 'invalid agent name' })
    return reply.header('cache-control', 'no-store').code(201).send(await create(req.currentUser.id, p.data.name, 'CHANNELS', id))
  })
  app.delete('/conversations/:id/agents/:agentId', async (req, reply) => {
    const { id, agentId } = req.params as { id: string; agentId: string }
    const a = await getAgent(agentId)
    if (!a || a.ownerId !== req.currentUser.id || a.conversationId !== id) return reply.code(404).send({ error: 'agent not found' })
    await revoke(a)
    return reply.code(204).send()
  })
}
