import { randomUUID } from 'node:crypto'
import Fastify, { LogController } from 'fastify'
import { expect, it } from 'vitest'
import { logSerializers, requestTrace, setupObservability } from '../src/observability.js'
import { prisma } from '../src/db.js'
import { makeTestApp } from './api-helpers.js'

it('동시 요청의 trace/DB 시간을 분리하고 로그에서 입력·쿼리·오류 원문을 제외한다', async () => {
  const logs: string[] = []
  const app = Fastify({ genReqId: () => randomUUID(),
    logController: new LogController({ disableRequestLogging: true }),
    logger: { serializers: logSerializers, stream: { write: (line: string) => { logs.push(line) } } },
  })
  setupObservability(app)
  app.post('/api/search', async () => {
    const first = requestTrace.getStore()!.traceId
    await prisma.user.count()
    await new Promise((resolve) => setTimeout(resolve, 15))
    expect(requestTrace.getStore()!.traceId).toBe(first)
    return { ok: true }
  })
  app.get('/auth/google/callback', async (req, reply) => {
    req.log.error({ err: new TypeError('SECRET_ERROR') }, 'code exchange failed')
    return reply.code(400).send({ error: 'invalid state' })
  })
  try {
    const ids = [randomUUID(), randomUUID()]
    const responses = await Promise.all(ids.map((id) => app.inject({ method: 'POST',
      url: '/api/search?q=SECRET_SEARCH', payload: { body: 'SECRET_BODY' },
      headers: { 'x-deuce-trace-id': id, 'x-deuce-diagnostics': '1', cookie: 'session=SECRET_COOKIE' } })))
    responses.forEach((r, i) => {
      expect(r.headers['x-deuce-trace-id']).toBe(ids[i])
      expect(r.headers['server-timing']).toMatch(/db;dur=[0-9.]+/)
    })
    const completed = logs.map((l) => JSON.parse(l)).filter((l) => l.event === 'http.completed')
    expect(completed).toHaveLength(2)
    completed.forEach((l) => { expect(l.dbCount).toBe(1); expect(l.dbMs).toBeGreaterThan(0); expect(l.queries[0].operation).toBe('count') })
    expect(new Set(completed.map((l) => l.traceId))).toEqual(new Set(ids))
    await app.inject('/auth/google/callback?code=SECRET_OAUTH&state=SECRET_STATE')
    expect(logs.join('')).not.toContain('SECRET_')
    const invalid = await app.inject({ method: 'POST', url: '/api/search', headers: { 'x-deuce-trace-id': 'SECRET_INVALID' } })
    expect(invalid.headers['x-deuce-trace-id']).toMatch(/^[0-9a-f-]{36}$/)
    expect(logs.join('')).not.toContain('SECRET_')
  } finally { await app.close() }
})

it('진단 업로드는 인증·닫힌 스키마·크기·사용자별 횟수 제한을 적용한다', async () => {
  const { app, loginAs } = await makeTestApp()
  const report = { version: 1, sessionId: randomUUID(), createdAt: Date.now(), dropped: 0,
    events: [{ event: 'ui.click', at: Date.now(), mono: 1, target: 'button' }] }
  try {
    expect((await app.inject({ method: 'POST', url: '/api/diagnostics', payload: report })).statusCode).toBe(401)
    const cookie = await loginAs('a@goldenlabs.dev')
    const send = (payload: unknown) => app.inject({ method: 'POST', url: '/api/diagnostics', headers: { cookie }, payload: payload as object })
    expect((await send({ ...report, events: [{ ...report.events[0], body: 'SECRET' }] })).statusCode).toBe(400)
    expect((await send({ ...report, events: Array(501).fill(report.events[0]) })).statusCode).toBe(400)
    const valid = await send(report)
    expect(valid.statusCode).toBe(201)
    expect(valid.json().reportId).toMatch(/^[0-9a-f-]{36}$/)
    expect((await send(report)).statusCode).toBe(429)
    const other = await loginAs('b@goldenlabs.dev')
    expect((await app.inject({ method: 'POST', url: '/api/diagnostics', headers: { cookie: other }, payload: report })).statusCode).toBe(201)
    expect((await app.inject({ method: 'POST', url: '/api/diagnostics', headers: { cookie: other }, payload: { ...report, unexpected: 'a'.repeat(300_000) } })).statusCode).toBe(413)
  } finally { await app.close() }
})
