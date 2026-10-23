import { randomBytes, randomUUID } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { RT, type RoomAgent } from '@deuce/shared'
import { prisma } from '../db.js'
import { isMember } from '../domain/conversations.js'
import { hashAgentToken } from '../domain/agents.js'
import { messageInclude, toMessageDto } from '../serializers.js'

const KEY_DAYS = 90
const include = { user: true, owner: true } as const

/** 방 멤버가 자기 AI 세션을 그 방에 연결·해제한다(ADR 014). 연결과 해제는 방에 시스템 메시지로 남긴다. */
export const agentManagementRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)
  app.addHook('preHandler', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!await isMember(id, req.currentUser.id)) return reply.code(403).send({ error: 'conversation member required' })
  })

  async function announce(conversationId: string, authorId: string, body: string) {
    const m = await prisma.message.create({ data: { conversationId, authorId, system: true, body }, include: messageInclude })
    app.io.to(`convo:${conversationId}`).emit(RT.messageNew, toMessageDto(m))
    app.io.to(`convo:${conversationId}`).emit(RT.conversationUpdated, { conversationId })
  }

  app.get('/conversations/:id/agents', async (req, reply) => {
    const { id } = req.params as { id: string }
    const agents = await prisma.agentConnection.findMany({
      where: { conversationId: id, revokedAt: null, expiresAt: { gt: new Date() },
        owner: { memberships: { some: { conversationId: id } } }, user: { memberships: { some: { conversationId: id } } } },
      include, orderBy: { createdAt: 'asc' },
    })
    const items: RoomAgent[] = agents.map((a) => ({
      id: a.id, name: a.user.name, ownerName: a.owner.name, editable: a.ownerId === req.currentUser.id,
      lastConnectedAt: a.lastConnectedAt?.toISOString() ?? null, expiresAt: a.expiresAt.toISOString(),
    }))
    return reply.header('cache-control', 'no-store').send(items)
  })

  app.post('/conversations/:id/agents', async (req, reply) => {
    const { id } = req.params as { id: string }
    const p = z.object({ name: z.string().trim().min(1).max(40) }).strict().safeParse(req.body)
    if (!p.success) return reply.code(400).send({ error: 'invalid agent name' })
    const room = await prisma.conversation.findUniqueOrThrow({ where: { id } })
    // 1:1 대화는 두 사람 사이의 방이므로 AI를 넣지 않는다.
    if (room.type === 'DM') return reply.code(400).send({ error: 'connect AI sessions to a group or channel' })
    const token = `deuce_${randomBytes(32).toString('base64url')}`
    const userId = randomUUID()
    const a = await prisma.$transaction(async (tx) => {
      await tx.user.create({ data: { id: userId, email: `${userId}@agents.deuce.invalid`, name: p.data.name, isAgent: true } })
      await tx.conversationMember.create({ data: { conversationId: id, userId } })
      return tx.agentConnection.create({ data: { conversationId: id, scope: 'SELECTED', ownerId: req.currentUser.id, userId,
        tokenHash: hashAgentToken(token), expiresAt: new Date(Date.now() + KEY_DAYS * 86400_000) } })
    })
    await announce(id, req.currentUser.id, `${req.currentUser.name}님이 AI 세션 ‘${p.data.name}’을 이 방에 연결했습니다. 이 AI는 이 방의 대화를 읽고 글을 쓸 수 있습니다.`)
    return reply.header('cache-control', 'no-store').code(201).send({ id: a.id, token, expiresAt: a.expiresAt.toISOString() })
  })

  app.delete('/conversations/:id/agents/:agentId', async (req, reply) => {
    const { id, agentId } = req.params as { id: string; agentId: string }
    const a = await prisma.agentConnection.findUnique({ where: { id: agentId }, include })
    if (!a || a.conversationId !== id || a.ownerId !== req.currentUser.id || a.revokedAt) return reply.code(404).send({ error: 'agent not found' })
    // 동시 해제 요청은 한 번만 처리해 공지가 중복되지 않게 한다.
    const revoked = await prisma.$transaction(async (tx) => {
      const { count } = await tx.agentConnection.updateMany({ where: { id: a.id, revokedAt: null }, data: { revokedAt: new Date() } })
      if (count === 1) await tx.conversationMember.deleteMany({ where: { conversationId: id, userId: a.userId } })
      return count === 1
    })
    if (!revoked) return reply.code(404).send({ error: 'agent not found' })
    await announce(id, req.currentUser.id, `${req.currentUser.name}님이 AI 세션 ‘${a.user.name}’의 연결을 해제했습니다.`)
    return reply.code(204).send()
  })
}
