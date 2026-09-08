import { randomUUID } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import { Prisma } from '@prisma/client'
import rateLimit from '@fastify/rate-limit'
import { z } from 'zod'
import { AgentRunSchema, RT } from '@deuce/shared'
import { prisma } from '../db.js'
import { isMember } from '../domain/conversations.js'
import { isAgentActive, agentConversationWhere } from '../domain/agents.js'
import { messageInclude, toMessageDto } from '../serializers.js'
import type { AppConfig } from '../config.js'

const input = z.object({ id: z.string().uuid(), prompt: z.string().trim().min(1).max(2000) }).strict()
export const agentRunRoutes: FastifyPluginAsync<{ config: AppConfig }> = async (app, { config }) => {
  app.addHook('preHandler', app.authenticate)
  await app.register(rateLimit, { global: false })
  const limited = { preHandler: app.rateLimit({ max: 12, timeWindow: '1 minute', keyGenerator: (req) => req.currentUser.id }) }
  app.post('/conversations/:id/agents/:agentId/requests', limited, async (req, reply) => {
    const { id, agentId } = req.params as { id: string; agentId: string }
    if (!await isMember(id, req.currentUser.id)) return reply.code(403).send({ error: 'conversation member required' })
    const p = input.safeParse(req.body)
    if (!p.success) return reply.code(400).send({ error: 'invalid AI request' })
    const previous = await prisma.agentRun.findUnique({ where: { id: p.data.id } })
    if (previous) {
      if (previous.agentId !== agentId || previous.conversationId !== id || previous.requestedById !== req.currentUser.id || previous.prompt !== p.data.prompt)
        return reply.code(409).send({ error: 'request id already used' })
      return AgentRunSchema.parse(previous)
    }
    const a = await prisma.agentConnection.findUnique({ where: { id: agentId }, include: { owner: true, user: true } })
    if (!a || !isAgentActive(a, config) || !await prisma.conversation.count({ where: { AND: [{ id }, agentConversationWhere(a)] } }))
      return reply.code(403).send({ error: 'AI is not participating' })
    if (app.agentRuntime.status(agentId) !== 'READY') return reply.code(409).send({ error: 'AI is offline or busy' })
    await app.agentRuntime.expire({ agentId })
    try {
      const { run, question } = await prisma.$transaction(async (tx) => {
        const question = await tx.message.create({ data: { id: randomUUID(), conversationId: id, authorId: req.currentUser.id, body: `@${a.user.name} ${p.data.prompt}` }, include: messageInclude })
        const run = await tx.agentRun.create({ data: { id: p.data.id, agentId, conversationId: id, requestedById: req.currentUser.id, prompt: p.data.prompt, questionMessageId: question.id } })
        return { run, question }
      })
      app.io.to(`convo:${id}`).emit(RT.messageNew, toMessageDto(question))
      app.agentRuntime.start(run)
      return reply.code(202).send(AgentRunSchema.parse(run))
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return reply.code(409).send({ error: 'AI request already in progress' })
      throw e
    }
  })
  app.get('/conversations/:id/agent-requests/:runId', async (req, reply) => {
    const { id, runId } = req.params as { id: string; runId: string }
    if (!await isMember(id, req.currentUser.id)) return reply.code(403).send({ error: 'conversation member required' })
    await app.agentRuntime.expire({ id: runId, conversationId: id })
    const run = await prisma.agentRun.findFirst({ where: { id: runId, conversationId: id } })
    if (!run) return reply.code(404).send({ error: 'AI request not found' })
    reply.header('cache-control', 'no-store')
    return AgentRunSchema.parse(run)
  })
}
