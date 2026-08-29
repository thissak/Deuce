import Fastify, { type FastifyInstance } from 'fastify'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })

  app.get('/health', async () => ({ status: 'ok' }))

  return app
}
