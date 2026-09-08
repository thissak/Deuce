import { randomBytes, randomUUID } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { AgentScopeSchema, RT } from '@deuce/shared'
import { prisma } from '../db.js'
import { isMember } from '../domain/conversations.js'
import { agentConversationWhere, hashAgentToken, isAgentActive } from '../domain/agents.js'
import type { AppConfig } from '../config.js'

const include = { user: true, owner: true } as const
const nameSchema = z.string().trim().min(1).max(40)
type Agent = NonNullable<Awaited<ReturnType<typeof getAgent>>>
const getAgent = (id: string) => prisma.agentConnection.findUnique({ where: { id }, include })
const dto = (a: Agent, viewer: string) => ({
  id: a.id, userId: a.userId, name: a.user.name, ownerName: a.owner.name, ownerId: a.ownerId,
  scope: a.scope, conversationId: a.conversationId,
  expiresAt: a.expiresAt.toISOString(), revoked: a.revokedAt !== null, editable: a.ownerId === viewer,
})

export async function getConversationAgents(id: string, viewer: string, config: AppConfig) {
  const room = await prisma.conversation.findUniqueOrThrow({ where: { id } })
  const candidates = await prisma.agentConnection.findMany({ where: { OR: [
    { conversationId: id },
    { conversationId: null, owner: { memberships: { some: { conversationId: id } } } },
  ] }, include: { ...include, exclusions: { where: { conversationId: id } } }, orderBy: { createdAt: 'asc' } })
  const results = await Promise.all(candidates.map(async (a) => ({
    ...dto(a, viewer), excluded: a.exclusions.length > 0,
    scopeAllows: a.conversationId !== null || a.scope === 'ALL' || room.type === 'CHANNEL',
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

  async function create(ownerId: string, name: string, scope: 'CHANNELS' | 'ALL', conversationId: string | null = null) {
    const token = `deuce_${randomBytes(32).toString('base64url')}`
    const userId = randomUUID()
    const a = await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: userId, email: `${userId}@agents.deuce.invalid`, name, isAgent: true } })
      if (conversationId) await tx.conversationMember.create({ data: { conversationId, userId } })
      return tx.agentConnection.create({ data: { conversationId, scope, ownerId, userId,
        tokenHash: hashAgentToken(token), expiresAt: new Date(Date.now() + 90 * 86400_000) } })
    })
    await notifyOwnerRooms(ownerId)
    return { id: a.id, token, expiresAt: a.expiresAt.toISOString() }
  }

  async function revoke(a: Agent) {
    await prisma.$transaction(async (tx) => {
      await tx.agentConnection.update({ where: { id: a.id }, data: { revokedAt: new Date() } })
      if (a.conversationId) await tx.conversationMember.deleteMany({ where: { conversationId: a.conversationId, userId: a.userId } })
    })
    await notifyOwnerRooms(a.ownerId)
  }

  app.get('/agents', async (req, reply) => {
    reply.header('cache-control', 'no-store')
    const agents = await prisma.agentConnection.findMany({ where: { ownerId: req.currentUser.id }, include, orderBy: { createdAt: 'asc' } })
    return agents.map((a) => dto(a, req.currentUser.id))
  })
  app.post('/agents', async (req, reply) => {
    const p = z.object({ name: nameSchema, scope: AgentScopeSchema }).strict().safeParse(req.body)
    if (!p.success) return reply.code(400).send({ error: 'invalid agent settings' })
    return reply.header('cache-control', 'no-store').code(201).send(await create(req.currentUser.id, p.data.name, p.data.scope))
  })
  app.patch('/agents/:agentId', async (req, reply) => {
    const { agentId } = req.params as { agentId: string }
    const a = await getAgent(agentId)
    if (!a || a.ownerId !== req.currentUser.id) return reply.code(404).send({ error: 'agent not found' })
    // 기존 키를 설정 변경만으로 다른 방에 접근시키지 않는다.
    if (a.conversationId || !isAgentActive(a, config)) return reply.code(400).send({ error: 'active personal agent required' })
    const p = z.object({ scope: AgentScopeSchema }).strict().safeParse(req.body)
    if (!p.success) return reply.code(400).send({ error: 'invalid agent settings' })
    const updated = await prisma.agentConnection.update({ where: { id: a.id }, data: { scope: p.data.scope }, include })
    await notifyOwnerRooms(a.ownerId)
    return dto(updated, req.currentUser.id)
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
    return getConversationAgents(id, req.currentUser.id, config)
  })
  app.put('/conversations/:id/agents/:agentId', async (req, reply) => {
    const { id, agentId } = req.params as { id: string; agentId: string }
    const a = await getAgent(agentId)
    if (!a || a.ownerId !== req.currentUser.id) return reply.code(404).send({ error: 'agent not found' })
    if (a.conversationId || !isAgentActive(a, config)) return reply.code(400).send({ error: 'active personal agent required' })
    const p = z.object({ excluded: z.boolean() }).strict().safeParse(req.body)
    if (!p.success) return reply.code(400).send({ error: 'invalid participation' })
    if (p.data.excluded) await prisma.agentConversationExclusion.upsert({
      where: { agentId_conversationId: { agentId, conversationId: id } },
      create: { agentId, conversationId: id }, update: {},
    })
    else await prisma.agentConversationExclusion.deleteMany({ where: { agentId, conversationId: id } })
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
