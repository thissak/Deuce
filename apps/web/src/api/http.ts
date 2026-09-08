import { diagnosticFetch, record } from '../diagnostics/recorder'
import { diagnosticRoute } from '@deuce/shared'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function api<T = unknown>(path: string, init?: RequestInit, traceId?: string): Promise<T> {
  const res = await diagnosticFetch(path, { credentials: 'same-origin', ...init }, traceId)
  if (!res.ok) {
    let message = res.statusText
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // JSON이 아닌 에러 본문은 statusText 유지
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  const data = await res.json()
  record('http.body', { traceId: res.headers?.get('x-deuce-trace-id') ?? traceId,
    requestId: res.headers?.get('x-request-id') ?? undefined, route: diagnosticRoute(path), status: res.status,
    ...(path.includes('/messages') && typeof data?.id === 'string' ? { messageId: data.id } : {}) })
  return data as T
}

export function apiJson<T = unknown>(method: string, path: string, body: unknown, traceId?: string): Promise<T> {
  return api<T>(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, traceId)
}
