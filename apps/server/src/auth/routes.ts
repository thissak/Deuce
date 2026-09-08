import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { AppConfig } from '../config.js'
import { prisma } from '../db.js'
import { createAuthUrl, type GoogleCodeExchanger } from './google.js'
import './session.js'
import { googleUser } from './user.js'

export interface AuthDeps {
  config: AppConfig
  exchange: GoogleCodeExchanger
}

export async function authRoutes(app: FastifyInstance, deps: AuthDeps): Promise<void> {
  const { config, exchange } = deps

  app.get('/auth/google', async (req, reply) => {
    const state = randomBytes(16).toString('hex')
    req.session.set('oauthState', state)
    return reply.redirect(createAuthUrl(config, state))
  })

  app.get('/auth/google/callback', async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string }
    if (!code || !state || state !== req.session.get('oauthState')) {
      return reply.code(400).send({ error: 'invalid oauth state' })
    }
    // state는 1회용 — 검증에 성공한 즉시 소거해 재생 공격을 막는다
    req.session.set('oauthState', undefined)

    let profile
    try {
      profile = await exchange(code)
    } catch (err) {
      req.log.error({ err }, 'Google code exchange failed')
      return reply.code(401).send({ error: 'login failed' })
    }
    const email = profile.email.toLowerCase()
    if (!config.allowedEmails.includes(email)) {
      return reply.code(403).send({ error: 'not allowed' })
    }
    const user = await googleUser(profile)
    req.session.set('userId', user.id)
    return reply.redirect('/')
  })

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
