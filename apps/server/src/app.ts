import Fastify, { type FastifyInstance } from 'fastify'
import secureSession from '@fastify/secure-session'
import { loadConfig, type AppConfig } from './config.js'
import { authRoutes } from './auth/routes.js'
import { createGoogleCodeExchanger, type GoogleCodeExchanger } from './auth/google.js'
import { authPlugin } from './plugins/auth.js'
import { userRoutes } from './routes/users.js'
import { conversationRoutes } from './routes/conversations.js'
import { messageRoutes } from './routes/messages.js'
import { searchRoutes } from './routes/search.js'
import { activityRoutes } from './routes/activity.js'

export interface AppOptions {
  config?: AppConfig
  // Task 4에서 사용: 테스트가 구글 코드 교환을 페이크로 대체한다
  exchangeGoogleCode?: GoogleCodeExchanger
}

export async function buildApp(opts: AppOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? loadConfig()
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })

  await app.register(secureSession, {
    key: config.sessionKey,
    // 내부 채팅 특성상 14일 세션 (GateLab ADR 003 전례). 기본값 24h를 대체한다.
    expiry: 60 * 60 * 24 * 14,
    cookie: { path: '/', httpOnly: true, sameSite: 'lax', secure: config.isProd },
  })

  await app.register(authPlugin, { config })

  app.setErrorHandler((err: unknown, req, reply) => {
    const error = err instanceof Error ? err : new Error(String(err))
    const status = (err as any)?.statusCode ?? 500
    if (status < 500) return reply.code(status).send({ error: error.message })
    req.log.error(error)
    return reply.code(500).send({ error: 'internal error' })
  })

  app.get('/health', async () => ({ status: 'ok' }))
  const exchange = opts.exchangeGoogleCode ?? createGoogleCodeExchanger(config)
  await app.register(authRoutes, { config, exchange })

  await app.register(userRoutes, { prefix: '/api' })
  await app.register(conversationRoutes, { prefix: '/api' })
  await app.register(messageRoutes, { prefix: '/api' })
  await app.register(searchRoutes, { prefix: '/api' })
  await app.register(activityRoutes, { prefix: '/api' })

  return app
}
