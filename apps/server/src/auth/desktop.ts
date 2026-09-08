import type { FastifyPluginAsync } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { z } from 'zod'
import type { AppConfig } from '../config.js'
import type { GoogleIdTokenVerifier } from './google.js'
import { googleUser } from './user.js'

export const desktopAuthRoutes: FastifyPluginAsync<{ config: AppConfig; verify: GoogleIdTokenVerifier }> = async (app, { config, verify }) => {
  const origin = new URL(config.google.callbackUrl).origin
  await app.register(rateLimit, { global: false })
  app.post('/auth/desktop/session', { bodyLimit: 16_384, preHandler: app.rateLimit({ max: 30, timeWindow: '1 minute' }) }, async (req, reply) => {
    reply.header('cache-control', 'no-store')
    if (!config.google.desktopClientId) return reply.code(503).send({ error: 'desktop login unavailable' })
    if (req.headers.origin && req.headers.origin !== origin) return reply.code(403).send({ error: 'invalid origin' })
    const parsed = z.object({ idToken: z.string().min(1).max(12_000) }).strict().safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid desktop login' })
    let profile
    try { profile = await verify(parsed.data.idToken) }
    catch { return reply.code(401).send({ error: 'login failed' }) }
    if (!config.allowedEmails.includes(profile.email.toLowerCase())) return reply.code(403).send({ error: 'not allowed' })
    let user
    try { user = await googleUser(profile) }
    catch { return reply.code(401).send({ error: 'login failed' }) }
    req.session.regenerate(); req.session.set('userId', user.id)
    req.log.info({ event: 'desktop.login', userId: user.id }, 'desktop login')
    return { ok: true }
  })
}
