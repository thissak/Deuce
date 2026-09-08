import { DiagnosticEventSchema, DiagnosticReportSchema, diagnosticRoute, type DiagnosticEvent, type DiagnosticReport } from '@deuce/shared'

const LIMIT = 500
let active = false
let events: DiagnosticEvent[] = []
let dropped = 0
let sessionId = ''
let cleanup: (() => void) | undefined
const listeners = new Set<() => void>()
export const diagnosticsEnabled = () => active
export const subscribeDiagnostics = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
export function record(event: DiagnosticEvent['event'], data: Omit<DiagnosticEvent, 'event' | 'at' | 'mono'> = {}): void {
  if (!active) return
  // 닫힌 스키마로 입력·오류 원문·URL query가 실수로 기록되는 것을 차단한다.
  const parsed = DiagnosticEventSchema.safeParse({ ...data, event, at: Date.now(), mono: performance.now() })
  if (!parsed.success) return
  events.push(parsed.data)
  if (events.length > LIMIT) { events.shift(); dropped++ }
}
export function snapshotDiagnostics(): DiagnosticReport {
  return DiagnosticReportSchema.parse({ version: 1, sessionId: sessionId || crypto.randomUUID(), createdAt: Date.now(), dropped, events: [...events] })
}
export function clearDiagnostics(): void { events = []; dropped = 0 }
export function errorType(error: unknown): NonNullable<DiagnosticEvent['errorType']> {
  const name = error instanceof Error ? error.name : ''
  return ['Error', 'TypeError', 'SyntaxError', 'RangeError', 'AbortError', 'ApiError', 'ZodError'].includes(name)
    ? name as NonNullable<DiagnosticEvent['errorType']> : 'other'
}

function observeBrowser(): () => void {
  const removers: (() => void)[] = []
  const on = (target: EventTarget, name: string, listener: EventListener) => {
    target.addEventListener(name, listener, true)
    removers.push(() => target.removeEventListener(name, listener, true))
  }
  on(window, 'error', (event) => {
    const e = event as ErrorEvent
    record('js.error', { errorType: errorType(e.error), line: e.lineno, column: e.colno })
  })
  on(window, 'unhandledrejection', (event) => record('js.error', { errorType: errorType((event as PromiseRejectionEvent).reason) }))
  on(window, 'online', () => record('online'))
  on(window, 'offline', () => record('offline'))
  on(document, 'visibilitychange', () => record('visibility', { visible: !document.hidden }))
  on(document, 'click', (event) => {
    const el = event.target instanceof Element ? event.target.closest('button,a,input,textarea') : null
    if (!el || el.closest('[data-diagnostics-panel]')) return
    record('ui.click', { target: el.tagName.toLowerCase() as 'button' | 'a' | 'input' | 'textarea', route: diagnosticRoute(location.pathname) })
  })
  const frames = new Set<number>()
  const seen = new WeakSet<Element>()
  const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i
  const observeMessage = (el: Element) => {
    const messageId = el.id.slice(4)
    if (seen.has(el) || !uuid.test(messageId)) return
    seen.add(el)
    const rect = el.getBoundingClientRect()
    const data = { messageId, visible: !document.hidden, inViewport: rect.bottom > 0 && rect.top < innerHeight }
    record('message.dom', data)
    // 다음 렌더링 기회에 대한 근사치다. 실제 픽셀 paint 시각으로 해석하지 않는다.
    const first = requestAnimationFrame(() => {
      frames.delete(first)
      const second = requestAnimationFrame(() => {
        frames.delete(second)
        if (el.isConnected) record('message.frame', { messageId, visible: !document.hidden })
      })
      frames.add(second)
    })
    frames.add(first)
  }
  const mutations = new MutationObserver((records) => {
    for (const mutation of records) for (const node of mutation.addedNodes) {
      if (!(node instanceof Element)) continue
      if (node.matches('[id^="msg-"]')) observeMessage(node)
      node.querySelectorAll('[id^="msg-"]').forEach(observeMessage)
    }
  })
  mutations.observe(document.documentElement, { childList: true, subtree: true })
  removers.push(() => { mutations.disconnect(); frames.forEach(cancelAnimationFrame) })
  if (typeof PerformanceObserver !== 'undefined') {
    for (const type of ['longtask', 'resource']) {
      if (!PerformanceObserver.supportedEntryTypes?.includes(type)) continue
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (type === 'longtask') record('longtask', { durationMs: entry.duration })
          else {
            const url = new URL(entry.name, location.href)
            if (url.origin === location.origin) record('resource', { route: diagnosticRoute(url.pathname), durationMs: entry.duration })
          }
        }
      })
      observer.observe({ type })
      removers.push(() => observer.disconnect())
    }
  }
  return () => removers.forEach((remove) => remove())
}

export function setDiagnostics(enabled: boolean): void {
  if (active === enabled) return
  active = enabled
  try { sessionStorage.setItem('deuce.diagnostics', enabled ? '1' : '0') } catch { /* 저장 차단 환경도 메모리 계측 가능 */ }
  if (!enabled && new URLSearchParams(location.search).has('diagnostics')) {
    const url = new URL(location.href)
    url.searchParams.delete('diagnostics')
    history.replaceState(history.state, '', url)
  }
  if (enabled) {
    sessionId = crypto.randomUUID()
    clearDiagnostics()
    cleanup = observeBrowser()
    record('diagnostics.start', { visible: !document.hidden })
  } else { cleanup?.(); cleanup = undefined }
  listeners.forEach((fn) => fn())
}
export function initDiagnostics(): void {
  const flag = new URLSearchParams(location.search).get('diagnostics')
  let saved = false
  try { saved = sessionStorage.getItem('deuce.diagnostics') === '1' } catch { /* optional */ }
  if (flag === '1' || (flag !== '0' && saved)) setDiagnostics(true)
}

export function beginSubmission(retry = false): string | undefined {
  if (!active) return undefined
  const traceId = crypto.randomUUID()
  record(retry ? 'ui.retry' : 'ui.submit', { traceId, route: 'messages' })
  return traceId
}

export async function diagnosticFetch(path: string, init?: RequestInit, suppliedTrace?: string): Promise<Response> {
  if (!active || path === '/api/diagnostics') return fetch(path, init)
  const traceId = suppliedTrace ?? crypto.randomUUID()
  const route = diagnosticRoute(path)
  const method = (init?.method ?? 'GET') as NonNullable<DiagnosticEvent['method']>
  const started = performance.now()
  const headers = new Headers(init?.headers)
  headers.set('x-deuce-trace-id', traceId)
  headers.set('x-deuce-diagnostics', '1')
  record('http.start', { traceId, route, method })
  try {
    const response = await fetch(path, { ...init, headers })
    const serverTiming = response.headers.get('server-timing') ?? ''
    const timing = (name: string) => {
      const value = serverTiming.match(new RegExp(`(?:^|,)\\s*${name};dur=([0-9.]+)`))?.[1]
      return value === undefined ? undefined : Number(value)
    }
    const requestId = response.headers.get('x-request-id') ?? undefined
    record('http.headers', { traceId, route, method, requestId, status: response.status,
      durationMs: performance.now() - started, serverMs: timing('app'), dbMs: timing('db') })
    return response
  } catch (error) {
    record('http.error', { traceId, route, method, durationMs: performance.now() - started, errorType: errorType(error) })
    throw error
  }
}
