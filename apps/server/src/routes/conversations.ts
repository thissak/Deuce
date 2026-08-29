import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { prisma } from '../db.js'
import { summarizeConversation } from '../domain/conversations.js'

const CreateSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('dm'), otherUserId: z.string() }),
  z.object({
    type: z.literal('group'),
    title: z.string().min(1).max(100),
    memberIds: z.array(z.string()).min(1).max(50),
  }),
])

export const conversationRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.post('/conversations', async (req, reply) => {
    const parsed = CreateSchema.safeParse(req.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid body' })
    const me = req.currentUser.id

    if (parsed.data.type === 'dm') {
      const { otherUserId } = parsed.data
      if (otherUserId === me) return reply.code(400).send({ error: 'cannot dm yourself' })
      const other = await prisma.user.findUnique({ where: { id: otherUserId } })
      if (!other) return reply.code(404).send({ error: 'user not found' })
      const existing = await prisma.conversation.findFirst({
        where: {
          type: 'DM',
          AND: [
            { members: { some: { userId: me } } },
            { members: { some: { userId: otherUserId } } },
          ],
        },
      })
      if (existing) return reply.code(200).send(await summarizeConversation(existing.id, me))
      const convo = await prisma.conversation.create({
        data: { type: 'DM', members: { create: [{ userId: me }, { userId: otherUserId }] } },
      })
      return reply.code(201).send(await summarizeConversation(convo.id, me))
    }

    const memberIds = [...new Set([me, ...parsed.data.memberIds])]
    const found = await prisma.user.count({ where: { id: { in: memberIds } } })
    if (found !== memberIds.length) return reply.code(404).send({ error: 'user not found' })
    const convo = await prisma.conversation.create({
      data: {
        type: 'GROUP',
        title: parsed.data.title,
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
    })
    return reply.code(201).send(await summarizeConversation(convo.id, me))
  })

  app.get('/conversations', async (req) => {
    const me = req.currentUser.id
    const memberships = await prisma.conversationMember.findMany({ where: { userId: me } })
    const summaries = await Promise.all(
      memberships.map((m) => summarizeConversation(m.conversationId, me)),
    )
    summaries.sort((a, b) =>
      (b.lastMessage?.createdAt ?? '').localeCompare(a.lastMessage?.createdAt ?? ''),
    )
    return summaries
  })
}
