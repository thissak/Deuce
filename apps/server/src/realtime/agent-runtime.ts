import type { FastifyInstance } from 'fastify'
import { on } from 'node:events'
import type { Namespace, Socket } from 'socket.io'
import type { AgentRun } from '@prisma/client'
import { RT } from '@deuce/shared'
import { z } from 'zod'
import { prisma } from '../db.js'
import { authenticateAgent, agentConversationWhere, isAgentActive } from '../domain/agents.js'
import { messageInclude, toMessageDto } from '../serializers.js'
import type { AppConfig } from '../config.js'
import type { FileStorage } from '../storage.js'

export const AGENT_RUN_TIMEOUT = 180_000
type Worker = { socket: Socket; run?: AgentRun; controller?: AbortController }
export type AgentRuntime = ReturnType<typeof setupAgentRuntime>
declare module 'fastify' { interface FastifyInstance { agentRuntime: AgentRuntime } }

// One live worker per personal AI. Socket.IO owns transport; PostgreSQL owns
// execution receipts and duplicate exclusion. No queued or automatic model retries.
export function setupAgentRuntime(app: FastifyInstance, config: AppConfig, storage: FileStorage) {
  const workers = new Map<string, Worker>()
  const tasks = new Set<Promise<void>>()
  const ns = app.io.of('/agent-runner') as Namespace
  const authSchema = z.object({ token: z.string(), provider: z.enum(['codex', 'claude']) })
  async function changed(ownerId: string) {
    const rooms = await prisma.conversationMember.findMany({ where: { userId: ownerId }, select: { conversationId: true } })
    for (const { conversationId } of rooms) app.io.to(`convo:${conversationId}`).emit(RT.conversationUpdated, { conversationId })
  }
  ns.use(async (socket, next) => {
    try {
      const p = authSchema.safeParse(socket.handshake.auth)
      const a = p.success ? await authenticateAgent(`Bearer ${p.data.token}`, config) : null
      if (!a || a.conversationId || workers.has(a.id)) return next(new Error('active personal AI connection required'))
      socket.data.agentId = a.id; socket.data.ownerId = a.ownerId
      next()
    } catch { next(new Error('AI connection failed')) }
  })
  ns.on('connection', (socket) => {
    const id = socket.data.agentId as string, ownerId = socket.data.ownerId as string
    // Concurrent handshakes can both pass middleware. The live slot has one owner.
    if (workers.has(id)) { socket.disconnect(true); return }
    const worker: Worker = { socket }; workers.set(id, worker)
    socket.emit('ready', { agentId: id, ownerId })
    void changed(ownerId).catch(() => {})
    app.log.info({ event: 'agent.runner.connected', agentId: id }, 'AI runner connected')
    socket.on('disconnect', () => {
      if (workers.get(id) === worker) workers.delete(id)
      worker.controller?.abort(new Error('OFFLINE'))
      if (worker.run) void fail(worker.run, 'OFFLINE').catch(() => {})
      void changed(ownerId).catch(() => {})
    })
  })
  async function fail(run: AgentRun, code: string) {
    const notice = await prisma.$transaction(async tx => {
      const changed = await tx.agentRun.updateMany({ where: { id: run.id, status: 'RUNNING' }, data: { status: 'FAILED', errorCode: code, finishedAt: new Date() } })
      if (!changed.count) return null
      return tx.message.create({ data: { conversationId: run.conversationId, authorId: run.requestedById, system: true,
        body: 'AI 요청을 완료하지 못했습니다. AI의 연결과 참여 상태를 확인한 뒤 다시 요청해 주세요.', replyToId: run.questionMessageId }, include: messageInclude })
    })
    if (notice) {
      app.io.to(`convo:${run.conversationId}`).emit(RT.messageNew, toMessageDto(notice))
    }
    app.log.info({ event: 'agent.run.failed', agentId: run.agentId, runId: run.id, conversationId: run.conversationId, code }, 'AI request failed')
    app.io.to(`convo:${run.conversationId}`).emit(RT.conversationUpdated, { conversationId: run.conversationId })
  }
  async function permitted(run: AgentRun) {
    const a = await prisma.agentConnection.findUnique({ where: { id: run.agentId }, include: { owner: true } })
    return a && isAgentActive(a, config) && await prisma.conversation.count({ where: { AND: [
      { id: run.conversationId, members: { some: { userId: run.requestedById } } }, agentConversationWhere(a),
    ] } }) > 0 ? a : null
  }
  async function execute(run: AgentRun) {
    const worker = workers.get(run.agentId)
    if (!worker?.socket.connected || worker.run) { await fail(run, 'OFFLINE'); return }
    worker.run = run
    worker.controller = new AbortController()
    app.io.to(`convo:${run.conversationId}`).emit(RT.conversationUpdated, { conversationId: run.conversationId })
    try {
      if (!await permitted(run)) throw new Error('ACCESS_REVOKED')
      const messages = await prisma.message.findMany({ where: { conversationId: run.conversationId, deletedAt: null, system: false },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50, include: { author: true, attachments: true } })
      // Bounded textual context. Binary/OCR extraction stays with the existing MCP path.
      let fileBudget = 128_000
      const context = await Promise.all(messages.reverse().map(async (m) => ({
        id: m.id, author: m.author.name, body: m.body, isAgent: m.author.isAgent,
        files: await Promise.all(m.attachments.map(async (f) => {
          let text: string | undefined
          if (/^text\//.test(f.contentType) && f.size <= 32_000 && f.size <= fileBudget) {
            fileBudget -= f.size
            try {
              const chunks: Buffer[] = []; let size = 0
              const stream = await storage.createReadStream(f.objectKey)
              for await (const chunk of stream) { size += Buffer.byteLength(chunk); if (size > 32_000) { stream.destroy(); break }; chunks.push(Buffer.from(chunk)) }
              if (size <= 32_000) text = Buffer.concat(chunks).toString('utf8')
            } catch { /* A missing file is identified as unavailable in context. */ }
          }
          return { name: f.fileName, contentType: f.contentType, text: text ?? '(본문 미제공)' }
        })),
      })))
      const stillRunning = await prisma.agentRun.count({ where: { id: run.id, status: 'RUNNING' } })
      if (!stillRunning || !await permitted(run)) throw new Error('ACCESS_REVOKED')
      app.log.info({ event: 'agent.run.dispatched', runId: run.id, agentId: run.agentId, conversationId: run.conversationId }, 'AI request dispatched')
      const signal = AbortSignal.any([worker.controller.signal, AbortSignal.timeout(AGENT_RUN_TIMEOUT)])
      const responses = on(worker.socket, 'result', { signal })
      let result: unknown
      try {
        worker.socket.emit('run', { id: run.id, conversationId: run.conversationId, prompt: run.prompt, context })
        for await (const [response] of responses) { if (response?.id === run.id) { result = response; break } }
      } finally { await responses.return?.() }
      const answer = z.object({ body: z.string().trim().min(1).max(4000) }).safeParse(result)
      if (!answer.success) throw new Error('RUNNER_FAILED')
      const posted = await prisma.$transaction(async (tx) => {
        // The same row lock is used by scope changes and room invitation changes.
        await tx.$queryRaw`SELECT id FROM "AgentConnection" WHERE id = ${run.agentId} FOR UPDATE`
        const a = await tx.agentConnection.findUnique({ where: { id: run.agentId }, include: { owner: true } })
        if (a) await tx.$queryRaw`SELECT "userId" FROM "ConversationMember" WHERE "conversationId" = ${run.conversationId} AND "userId" IN (${run.requestedById}, ${a.ownerId}) FOR KEY SHARE`
        if (!a || !isAgentActive(a, config) || !await tx.conversation.count({ where: { AND: [
          { id: run.conversationId, members: { some: { userId: run.requestedById } } }, agentConversationWhere(a),
        ] } })) throw new Error('ACCESS_REVOKED')
        const claimed = await tx.agentRun.updateMany({ where: { id: run.id, status: 'RUNNING', createdAt: { gt: new Date(Date.now() - AGENT_RUN_TIMEOUT) } },
          data: { status: 'COMPLETED', finishedAt: new Date() } })
        if (!claimed.count) return null
        const m = await tx.message.create({ data: { conversationId: run.conversationId, authorId: a.userId,
          body: answer.data.body, replyToId: run.questionMessageId }, include: messageInclude })
        await tx.agentRun.update({ where: { id: run.id }, data: { resultMessageId: m.id } })
        return m
      })
      if (posted) {
        app.io.to(`convo:${run.conversationId}`).emit(RT.messageNew, toMessageDto(posted))
        app.log.info({ event: 'agent.run.completed', runId: run.id, agentId: run.agentId, messageId: posted.id, durationMs: Date.now() - run.createdAt.getTime() }, 'AI reply posted')
      } else await fail(run, 'TIMEOUT')
    } catch (e) {
      const code = worker.controller.signal.aborted ? 'ACCESS_REVOKED'
        : e instanceof Error && ['ACCESS_REVOKED', 'RUNNER_FAILED'].includes(e.message) ? e.message : 'TIMEOUT'
      await fail(run, code)
      worker.socket.emit('cancel', { id: run.id })
    } finally {
      if (worker.run?.id === run.id) { worker.run = undefined; worker.controller = undefined }
      app.io.to(`convo:${run.conversationId}`).emit(RT.conversationUpdated, { conversationId: run.conversationId })
    }
  }
  const runtime = {
    async expire(where: { agentId?: string; id?: string; conversationId?: string }) {
      const stale = await prisma.agentRun.findMany({ where: { ...where, status: 'RUNNING', createdAt: { lte: new Date(Date.now() - AGENT_RUN_TIMEOUT) } } })
      for (const run of stale) await fail(run, 'TIMEOUT')
    },
    status(id: string): 'OFFLINE' | 'READY' | 'BUSY' { const w = workers.get(id); return !w?.socket.connected ? 'OFFLINE' : w.run ? 'BUSY' : 'READY' },
    start(run: AgentRun) {
      const task = execute(run).catch(() => { app.log.error({ event: 'agent.run.persistence_failed', runId: run.id }, 'AI execution receipt unavailable') })
      tasks.add(task); void task.finally(() => tasks.delete(task))
    },
    async cancel(agentId: string, conversationId?: string) {
      const w = workers.get(agentId)
      if (w?.run && (!conversationId || w.run.conversationId === conversationId)) {
        const runId = w.run.id
        await fail(w.run, 'ACCESS_REVOKED'); w.controller?.abort(); w.socket.emit('cancel', { id: runId })
      }
    },
  }
  app.decorate('agentRuntime', runtime)
  app.addHook('preClose', async () => {
    for (const w of workers.values()) { w.controller?.abort(); if (w.run) w.socket.emit('cancel', { id: w.run.id }); w.socket.disconnect(true) }
    await Promise.allSettled([...tasks])
  })
  return runtime
}
