import { randomUUID } from 'node:crypto'
import type { FastifyPluginAsync } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { DiagnosticReportSchema } from '@deuce/shared'

export const diagnosticRoutes: FastifyPluginAsync = async (app) => {
  await app.register(rateLimit, { global: false })
  app.post('/diagnostics', {
    bodyLimit: 256 * 1024,
    preHandler: [app.authenticate, app.rateLimit({ max: 3, timeWindow: '1 minute', keyGenerator: (req) => req.currentUser.id })],
  }, async (req, reply) => {
    const parsed = DiagnosticReportSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid diagnostic report' })
    const reportId = randomUUID()
    const report = parsed.data
    req.log.info({ event: 'diagnostic.report', reportId, userId: req.currentUser.id,
      sessionId: report.sessionId, clientCreatedAt: report.createdAt, count: report.events.length,
      dropped: report.dropped }, 'client diagnostic report')
    for (const [index, entry] of report.events.entries()) {
      // 클라이언트 관측값임을 명시하고 서버 로그의 event/time 필드와 섞지 않는다.
      req.log.info({ event: 'diagnostic.client', reportId, index, client: entry }, 'client observation')
    }
    return reply.code(201).send({ reportId })
  })
}
