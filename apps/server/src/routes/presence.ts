import type { FastifyPluginAsync } from 'fastify'

export const presenceRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.get('/presence', async (req) => {
    void req
    return app.presence.snapshot()
  })
}
