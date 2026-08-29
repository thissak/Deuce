import fp from 'fastify-plugin'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { AppConfig } from '../config.js'
import { prisma } from '../db.js'
import '../auth/session.js'

export interface CurrentUser {
  id: string
  email: string
  name: string
  avatarUrl: string | null
}

declare module 'fastify' {
  interface FastifyRequest {
    currentUser: CurrentUser
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
}

export interface AuthPluginOptions {
  config: AppConfig
}

export const authPlugin = fp<AuthPluginOptions>(async (app, opts) => {
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    const userId = req.session.get('userId')
    if (!userId) return reply.code(401).send({ error: 'unauthorized' })
    const user = await prisma.user.findUnique({ where: { id: userId } })
    // 허용목록 매 요청 재검사 — 목록에서 빠지면 즉시 차단 (세션 회수 대체)
    if (!user || !opts.config.allowedEmails.includes(user.email)) {
      req.session.delete()
      return reply.code(401).send({ error: 'unauthorized' })
    }
    req.currentUser = { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl }
  })
})
