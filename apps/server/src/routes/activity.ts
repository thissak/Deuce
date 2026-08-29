import type { FastifyPluginAsync } from 'fastify'
import type { ActivityItem } from '@deuce/shared'
import { prisma } from '../db.js'
import { toUserDto } from '../serializers.js'

export const activityRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.get('/activity', async (req) => {
    const me = req.currentUser.id
    const mentions = await prisma.mention.findMany({
      where: { mentionedUserId: me, message: { deletedAt: null, authorId: { not: me } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { message: { include: { author: true } } },
    })
    const reactions = await prisma.reaction.findMany({
      where: { userId: { not: me }, message: { authorId: me, deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { message: true, user: true },
    })
    const items: ActivityItem[] = [
      ...mentions.map((m) => ({
        kind: 'mention' as const,
        messageId: m.messageId,
        conversationId: m.message.conversationId,
        body: m.message.body,
        actor: toUserDto(m.message.author),
        emoji: null,
        createdAt: m.createdAt.toISOString(),
      })),
      ...reactions.map((r) => ({
        kind: 'reaction' as const,
        messageId: r.messageId,
        conversationId: r.message.conversationId,
        body: r.message.body,
        actor: toUserDto(r.user),
        emoji: r.emoji,
        createdAt: r.createdAt.toISOString(),
      })),
    ]
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return items.slice(0, 30)
  })
}
