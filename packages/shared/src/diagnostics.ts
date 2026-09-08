import { z } from 'zod'

export const DiagnosticRouteSchema = z.enum([
  'page.chat', 'page.activity', 'page.home', 'auth', 'users', 'conversations',
  'conversation', 'messages', 'message', 'attachments', 'members', 'read', 'mute',
  'agents', 'reactions', 'pin', 'search', 'activity', 'presence', 'socket', 'diagnostics', 'health', 'asset', 'other',
])
export function diagnosticRoute(value: string): z.infer<typeof DiagnosticRouteSchema> {
  const path = value.split(/[?#]/)[0] ?? ''
  if (path === '/') return 'page.home'
  if (/^\/chat(?:\/|$)/.test(path)) return 'page.chat'
  if (path === '/activity') return 'page.activity'
  if (path.startsWith('/auth/')) return 'auth'
  if (path.startsWith('/socket.io')) return 'socket'
  if (path === '/health') return 'health'
  if (path === '/mcp') return 'agents'
  if (path.startsWith('/assets/')) return 'asset'
  const parts = path.split('/').filter(Boolean)
  if (parts[0] !== 'api') return 'other'
  if (parts[1] === 'agent') return 'agents'
  if (parts[1] === 'conversations') {
    if (!parts[2]) return 'conversations'
    if (!parts[3]) return 'conversation'
    const child = parts[3]
    if (child === 'agents') return 'agents'
    return ['messages', 'attachments', 'members', 'read', 'mute'].includes(child)
      ? child as 'messages' | 'attachments' | 'members' | 'read' | 'mute' : 'other'
  }
  if (parts[1] === 'messages') {
    return parts[3] === 'reactions' ? 'reactions' : parts[3] === 'pin' ? 'pin' : 'message'
  }
  const parsed = DiagnosticRouteSchema.safeParse(parts[1])
  return parsed.success ? parsed.data : 'other'
}

export const DiagnosticEventSchema = z.object({
  event: z.enum(['diagnostics.start', 'navigation', 'ui.click', 'ui.submit', 'ui.retry',
    'http.start', 'http.headers', 'http.body', 'http.error', 'cache.message',
    'socket.connect', 'socket.disconnect', 'socket.error', 'socket.reconnect', 'socket.event',
    'message.dom', 'message.frame', 'resource', 'longtask', 'js.error', 'query.error', 'mutation.error',
    'visibility', 'online', 'offline']),
  at: z.number().finite().nonnegative(),
  mono: z.number().finite().nonnegative(),
  traceId: z.uuid().optional(),
  requestId: z.uuid().optional(),
  messageId: z.uuid().optional(),
  route: DiagnosticRouteSchema.optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).optional(),
  durationMs: z.number().finite().nonnegative().optional(),
  serverMs: z.number().finite().nonnegative().optional(),
  dbMs: z.number().finite().nonnegative().optional(),
  status: z.number().int().min(0).max(599).optional(),
  count: z.number().int().nonnegative().optional(),
  line: z.number().int().nonnegative().optional(),
  column: z.number().int().nonnegative().optional(),
  visible: z.boolean().optional(),
  inViewport: z.boolean().optional(),
  transport: z.enum(['websocket', 'polling', 'other']).optional(),
  socketEvent: z.enum(['message.new', 'message.updated', 'message.deleted', 'reaction.changed',
    'read.advanced', 'presence.changed', 'conversation.created', 'conversation.updated', 'conversation.removed']).optional(),
  target: z.enum(['button', 'a', 'input', 'textarea', 'other']).optional(),
  errorType: z.enum(['Error', 'TypeError', 'SyntaxError', 'RangeError', 'AbortError', 'ApiError', 'ZodError', 'other']).optional(),
  reason: z.enum(['io server disconnect', 'io client disconnect', 'ping timeout', 'transport close', 'transport error', 'other']).optional(),
}).strict()
export type DiagnosticEvent = z.infer<typeof DiagnosticEventSchema>
export const DiagnosticReportSchema = z.object({
  version: z.literal(1),
  sessionId: z.uuid(),
  createdAt: z.number().finite().nonnegative(),
  dropped: z.number().int().nonnegative(),
  events: z.array(DiagnosticEventSchema).max(500),
}).strict()
export type DiagnosticReport = z.infer<typeof DiagnosticReportSchema>
