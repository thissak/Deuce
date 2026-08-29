import type { FastifyInstance } from 'fastify'
import type { AppConfig } from '../config.js'
import { prisma } from '../db.js'
import '../auth/session.js'

export interface AuthDeps {
  config: AppConfig
}

export async function authRoutes(app: FastifyInstance, deps: AuthDeps): Promise<void> {
  app.get('/auth/me', async (req, reply) => {
    const userId = req.session.get('userId')
    if (!userId) return reply.code(401).send({ error: 'unauthorized' })
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      req.session.delete()
      return reply.code(401).send({ error: 'unauthorized' })
    }
    return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl }
  })

  app.post('/auth/logout', async (req, reply) => {
    req.session.delete()
    return reply.code(204).send()
  })
}
