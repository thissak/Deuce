import Fastify, { LogController, type FastifyInstance } from 'fastify'
import secureSession from '@fastify/secure-session'
import multipart from '@fastify/multipart'
import { loadConfig, type AppConfig } from './config.js'
import { authRoutes } from './auth/routes.js'
import { createGoogleCodeExchanger, createDesktopTokenVerifier, type GoogleCodeExchanger, type GoogleIdTokenVerifier } from './auth/google.js'
import { authPlugin } from './plugins/auth.js'
import { userRoutes } from './routes/users.js'
import { conversationRoutes } from './routes/conversations.js'
import { messageRoutes } from './routes/messages.js'
import { searchRoutes } from './routes/search.js'
import { activityRoutes } from './routes/activity.js'
import { presenceRoutes } from './routes/presence.js'
import { attachmentRoutes } from './routes/attachments.js'
import { LocalDiskStorage } from './storage.js'
import { setupRealtime } from './realtime/io.js'
import { randomUUID } from 'node:crypto'
import { logSerializers, setupObservability } from './observability.js'
import { agentManagementRoutes, agentAccessRoutes } from './routes/agents.js'
import { diagnosticRoutes } from './routes/diagnostics.js'
import { desktopAuthRoutes } from './auth/desktop.js'
import { mcpRoutes } from './routes/mcp.js'
import { setupAgentRuntime } from './realtime/agent-runtime.js'
import { agentRunRoutes } from './routes/agent-runs.js'

export interface AppOptions {
  config?: AppConfig
  // Task 4에서 사용: 테스트가 구글 코드 교환을 페이크로 대체한다
  exchangeGoogleCode?: GoogleCodeExchanger
  verifyDesktopToken?: GoogleIdTokenVerifier
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? loadConfig()
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : { serializers: logSerializers },
    genReqId: () => randomUUID(),
    logController: new LogController({ disableRequestLogging: true }),
    // 테스트에서 keep-alive 소켓이 idle로 표시되기 직전에 app.close()가 호출되면
    // 레이스로 종료가 멈출 수 있다 (Fastify 기본값 'idle'은 idle 소켓만 정리).
    forceCloseConnections: process.env.NODE_ENV === 'test' ? true : 'idle',
  })
  setupObservability(app)

  await app.register(secureSession, {
    key: config.sessionKey,
    // 내부 채팅 특성상 14일 세션 (GateLab ADR 003 전례). 기본값 24h를 대체한다.
    expiry: 60 * 60 * 24 * 14,
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      maxAge: 60 * 60 * 24 * 14,
    },
  })

  await app.register(authPlugin, { config })

  await app.register(multipart, {
    limits: { fileSize: config.maxUploadBytes, files: 1 },
  })

  app.setErrorHandler((err: unknown, req, reply) => {
    const error = err instanceof Error ? err : new Error(String(err))
    const status = (err as any)?.statusCode ?? 500
    if (status < 500) return reply.code(status).send({ error: error.message })
    req.log.error({ err: error }, 'request failed')
    return reply.code(500).send({ error: 'internal error' })
  })

  app.get('/health', async () => ({ status: 'ok' }))
  const exchange = opts.exchangeGoogleCode ?? createGoogleCodeExchanger(config)
  await app.register(authRoutes, { config, exchange })
  await app.register(desktopAuthRoutes, { config, verify: opts.verifyDesktopToken ?? createDesktopTokenVerifier(config) })

  await app.register(userRoutes, { prefix: '/api' })
  await app.register(conversationRoutes, { prefix: '/api' })
  await app.register(messageRoutes, { prefix: '/api', config })
  await app.register(searchRoutes, { prefix: '/api' })
  await app.register(activityRoutes, { prefix: '/api' })
  await app.register(diagnosticRoutes, { prefix: '/api' })
  await app.register(attachmentRoutes, {
    prefix: '/api',
    storage: new LocalDiskStorage(config.uploadDir),
  })

  setupRealtime(app, config)
  setupAgentRuntime(app, config, new LocalDiskStorage(config.uploadDir))
  await app.register(agentRunRoutes, { prefix: '/api', config })
  await app.register(agentManagementRoutes, { prefix: '/api', config })
  await app.register(agentAccessRoutes, { prefix: '/api/agent', config, storage: new LocalDiskStorage(config.uploadDir) })
  await app.register(mcpRoutes, { config })
  await app.register(presenceRoutes, { prefix: '/api' })

  return app
}
