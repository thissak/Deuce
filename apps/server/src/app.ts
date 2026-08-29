import Fastify, { type FastifyInstance } from 'fastify'
import secureSession from '@fastify/secure-session'
import { loadConfig, type AppConfig } from './config.js'
import { authRoutes } from './auth/routes.js'
import { createGoogleCodeExchanger, type GoogleCodeExchanger } from './auth/google.js'

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
    cookie: { path: '/', httpOnly: true, sameSite: 'lax', secure: config.isProd },
  })

  app.get('/health', async () => ({ status: 'ok' }))
  const exchange = opts.exchangeGoogleCode ?? createGoogleCodeExchanger(config)
  await app.register(authRoutes, { config, exchange })

  return app
}
