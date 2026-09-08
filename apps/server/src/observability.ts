import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { diagnosticRoute } from '@deuce/shared'

type RequestTrace = {
  traceId: string; requestId: string; started: number; detailed: boolean
  dbCount: number; dbMs: number; messageId?: string
  queries: { model: string; operation: string; durationMs: number; failed: boolean }[]
}
export const requestTrace = new AsyncLocalStorage<RequestTrace>()
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const traces = new WeakMap<FastifyRequest, RequestTrace>()
export const roundMs = (n: number) => Math.round(n * 100) / 100
export function safeError(error: unknown): { type: string; message: string; stack: string; code?: string } {
  const e = error as { name?: string; code?: string } | null
  const name = e?.name ?? ''
  return {
    message: '[redacted]', stack: error instanceof Error
      ? (error.stack?.match(/apps\/server\/src\/[A-Za-z0-9_/-]+\.[cm]?[jt]s:\d+:\d+/g) ?? []).slice(0, 8).join('\n') : '',
    type: ['Error', 'TypeError', 'SyntaxError', 'RangeError', 'AbortError', 'ZodError',
      'PrismaClientKnownRequestError', 'PrismaClientUnknownRequestError'].includes(name) ? name : 'Error',
    ...(typeof e?.code === 'string' && /^(P\d{4}|FST_ERR_[A-Z_]+|E[A-Z]{2,20})$/.test(e.code) ? { code: e.code } : {}),
  }
}
export const logSerializers = {
  req: (req: { method?: string; url?: string }) => ({ method: req.method, route: diagnosticRoute(req.url ?? '') }),
  err: safeError,
}

export function setupObservability(app: FastifyInstance): void {
  app.addHook('onRequest', (req, reply, done) => {
    const supplied = req.headers['x-deuce-trace-id']
    const trace: RequestTrace = {
      traceId: typeof supplied === 'string' && uuid.test(supplied) ? supplied : randomUUID(),
      requestId: req.id, started: performance.now(), detailed: req.headers['x-deuce-diagnostics'] === '1',
      dbCount: 0, dbMs: 0, queries: [],
    }
    traces.set(req, trace)
    reply.header('x-deuce-trace-id', trace.traceId).header('x-request-id', req.id)
    req.log.info({ event: 'http.received', traceId: trace.traceId, requestId: req.id,
      route: diagnosticRoute(req.url), method: req.method }, 'request received')
    requestTrace.run(trace, done)
  })
  app.addHook('onSend', async (req, reply, payload) => {
    const t = traces.get(req)
    if (t) reply.header('server-timing', `app;dur=${roundMs(performance.now() - t.started)}, db;dur=${roundMs(t.dbMs)}`)
    return payload
  })
  app.addHook('onResponse', async (req, reply) => {
    const t = traces.get(req)
    if (!t) return
    const durationMs = roundMs(performance.now() - t.started)
    req.log.info({ event: 'http.completed', traceId: t.traceId, requestId: req.id,
      route: diagnosticRoute(req.url), method: req.method, status: reply.statusCode, durationMs,
      dbCount: t.dbCount, dbMs: roundMs(t.dbMs), messageId: t.messageId,
      ...(t.detailed || durationMs >= 500 || reply.statusCode >= 500 ? { queries: t.queries } : {}),
    }, 'request trace')
  })
  app.addHook('onError', async (req, _reply, err) => {
    req.log.error({ event: 'http.error', traceId: traces.get(req)?.traceId, err }, 'request error')
  })
  const delay = monitorEventLoopDelay({ resolution: 20 })
  let timer: ReturnType<typeof setInterval> | undefined
  app.addHook('onReady', async () => {
    app.log.info({ event: 'service.ready' }, 'service ready')
    if (process.env.NODE_ENV === 'test') return
    delay.enable()
    timer = setInterval(() => {
      const mem = process.memoryUsage()
      app.log.info({ event: 'service.metrics', rssBytes: mem.rss, heapUsedBytes: mem.heapUsed,
        eventLoopP99Ms: roundMs(delay.percentile(99) / 1e6), eventLoopMaxMs: roundMs(delay.max / 1e6),
        sockets: app.io?.engine.clientsCount ?? 0 }, 'service metrics')
      delay.reset()
    }, 60_000)
    timer.unref()
  })
  app.addHook('preClose', async () => {
    if (timer) clearInterval(timer)
    delay.disable()
    app.log.info({ event: 'service.stopping' }, 'service stopping')
  })
}
