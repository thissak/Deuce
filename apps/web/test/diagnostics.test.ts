import { afterEach, expect, it, vi } from 'vitest'
import { diagnosticRoute } from '@deuce/shared'
import { beginSubmission, clearDiagnostics, diagnosticFetch, record, setDiagnostics, snapshotDiagnostics } from '../src/diagnostics/recorder'

afterEach(() => { setDiagnostics(false); clearDiagnostics(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

it('꺼져 있으면 요청을 그대로 전달하고 기록하지 않는다', async () => {
  const mock = vi.fn().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', mock)
  await diagnosticFetch('/api/search?q=secret', { method: 'GET' })
  expect(mock).toHaveBeenCalledWith('/api/search?q=secret', { method: 'GET' })
  expect(snapshotDiagnostics().events).toHaveLength(0)
})

it('왕복 시간·서버 시간을 연결하되 검색어·본문·오류 원문을 기록하지 않는다', async () => {
  setDiagnostics(true)
  const requestId = crypto.randomUUID()
  const mock = vi.fn().mockResolvedValue(new Response('{}', { headers: { 'x-request-id': requestId, 'server-timing': 'app;dur=12.3, db;dur=7.2' } }))
  vi.stubGlobal('fetch', mock)
  const traceId = beginSubmission()
  await diagnosticFetch('/api/search?q=SECRET_QUERY', { method: 'POST', body: 'SECRET_BODY' }, traceId)
  expect(new Headers(mock.mock.calls[0]![1].headers).get('x-deuce-trace-id')).toBe(traceId)
  const response = snapshotDiagnostics().events.find((e) => e.event === 'http.headers')!
  expect(response).toMatchObject({ traceId, requestId, serverMs: 12.3, dbMs: 7.2, route: 'search' })
  expect(response.durationMs).toBeGreaterThanOrEqual(0)
  mock.mockRejectedValueOnce(new TypeError('SECRET_ERROR'))
  await expect(diagnosticFetch('/api/search?q=SECRET_QUERY')).rejects.toThrow('SECRET_ERROR')
  expect(snapshotDiagnostics().events.at(-1)).toMatchObject({ event: 'http.error', errorType: 'TypeError' })
  expect(JSON.stringify(snapshotDiagnostics())).not.toContain('SECRET_')
  expect(diagnosticRoute('/unknown/SECRET_PATH')).toBe('other')
})

it('실제 DOM 추가를 기록하고 비활성화 시 관측과 frame 콜백을 해제한다', async () => {
  const frames = new Map<number, FrameRequestCallback>()
  let id = 0
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.set(++id, fn); return id })
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key))
  setDiagnostics(true)
  const el = document.createElement('div'); const messageId = crypto.randomUUID()
  el.id = `msg-${messageId}`; el.textContent = 'SECRET_MESSAGE'
  document.body.append(el)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(snapshotDiagnostics().events).toContainEqual(expect.objectContaining({ event: 'message.dom', messageId }))
  expect(JSON.stringify(snapshotDiagnostics())).not.toContain('SECRET_MESSAGE')
  expect(frames.size).toBe(1)
  setDiagnostics(false)
  expect(frames.size).toBe(0)
  const count = snapshotDiagnostics().events.length
  record('offline')
  expect(snapshotDiagnostics().events).toHaveLength(count)
})

it('500건 상한·버린 개수를 유지하고 스키마 밖 데이터는 받지 않는다', () => {
  setDiagnostics(true)
  clearDiagnostics()
  for (let i = 0; i < 510; i++) record('online')
  record('ui.click', { body: 'SECRET' } as never)
  const report = snapshotDiagnostics()
  expect(report.events).toHaveLength(500)
  expect(report.dropped).toBe(10)
  expect(JSON.stringify(report)).not.toContain('SECRET')
})
