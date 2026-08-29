import { Server } from 'socket.io'
import { parseCookie } from 'cookie'
import type { FastifyInstance } from 'fastify'
import { RT, RTC, type ClientToServerEvents, type ServerToClientEvents } from '@deuce/shared'
import type { AppConfig } from '../config.js'
import { prisma } from '../db.js'
import { PresenceTracker } from './presence.js'
import '../auth/session.js'

declare module 'fastify' {
  interface FastifyInstance {
    io: Server<ClientToServerEvents, ServerToClientEvents>
    presence: PresenceTracker
  }
}

export function setupRealtime(app: FastifyInstance, config: AppConfig): void {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(app.server, { serveClient: false })
  const presence = new PresenceTracker()

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
    } catch (err) {
      app.log.debug({ err }, 'socket handshake rejected')
      return next(new Error('unauthorized'))
    }
  })

  io.on('connection', async (socket) => {
    const userId = socket.data.userId as string

    // presence 등록·리스너는 room join의 DB 왕복(prisma) 이전에 동기로 붙인다.
    // 그렇지 않으면 클라이언트가 연결 직후 보내는 presence:away 등이
    // 리스너 등록 전에 도착해 유실된다.
    const onlineChange = presence.connect(userId)
    if (onlineChange) io.emit(RT.presenceChanged, { userId, status: onlineChange })

    socket.on(RTC.presenceAway, () => {
      const change = presence.setAway(userId)
      if (change) io.emit(RT.presenceChanged, { userId, status: change })
    })
    socket.on(RTC.presenceActive, () => {
      const change = presence.setActive(userId)
      if (change) io.emit(RT.presenceChanged, { userId, status: change })
    })
    socket.on('disconnect', () => {
      const change = presence.disconnect(userId)
      if (change) io.emit(RT.presenceChanged, { userId, status: change })
    })

    try {
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
  app.decorate('presence', presence)
  app.addHook('onClose', async () => {
    io.close()
  })
}
