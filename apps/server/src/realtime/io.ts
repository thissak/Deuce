import { Server } from 'socket.io'
import { parseCookie } from 'cookie'
import type { FastifyInstance } from 'fastify'
import type { AppConfig } from '../config.js'
import { prisma } from '../db.js'
import '../auth/session.js'

declare module 'fastify' {
  interface FastifyInstance {
    io: Server
  }
}

export function setupRealtime(app: FastifyInstance, config: AppConfig): void {
  const io = new Server(app.server, { serveClient: false })

  io.use(async (socket, next) => {
    try {
      const header = socket.handshake.headers.cookie
      const cookies = header ? parseCookie(header) : {}
      const raw = cookies['session']
      const session = raw ? app.decodeSecureSession(raw) : null
      const userId = session?.get('userId')
      if (!userId) return next(new Error('unauthorized'))
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (!user || !config.allowedEmails.includes(user.email)) {
        return next(new Error('unauthorized'))
      }
      socket.data.userId = user.id
      return next()
    } catch {
      return next(new Error('unauthorized'))
    }
  })

  io.on('connection', async (socket) => {
    try {
      const userId = socket.data.userId as string
      await socket.join(`user:${userId}`)
      if (socket.disconnected) return
      const memberships = await prisma.conversationMember.findMany({ where: { userId } })
      if (socket.disconnected) return
      await socket.join(memberships.map((m) => `convo:${m.conversationId}`))
    } catch (err) {
      app.log.error(err)
      socket.disconnect(true)
    }
  })

  app.decorate('io', io)
  app.addHook('onClose', async () => {
    io.close()
  })
}
