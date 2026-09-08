import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import type { SearchResult } from '@deuce/shared'
import { prisma } from '../db.js'

const QuerySchema = z.object({ q: z.string().min(2).max(100) })

interface Row {
  messageId: string
  conversationId: string
  conversationType: 'DM' | 'GROUP' | 'CHANNEL'
  conversationTitle: string | null
  body: string
  authorName: string
  createdAt: Date
}

export const searchRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.get('/search', async (req, reply) => {
    const parsed = QuerySchema.safeParse(req.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid query' })
    const me = req.currentUser.id
    // %·_·\ 는 리터럴로 취급 (ILIKE 와일드카드 주입 방지)
    const escaped = parsed.data.q.replace(/[\\%_]/g, (ch) => `\\${ch}`)
    const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT m.id AS "messageId",
             m."conversationId",
             c.type::text AS "conversationType",
             c.title AS "conversationTitle",
             m.body,
             u.name AS "authorName",
             m."createdAt"
      FROM "Message" m
      JOIN "User" u ON u.id = m."authorId"
      JOIN "Conversation" c ON c.id = m."conversationId"
      JOIN "ConversationMember" cm
        ON cm."conversationId" = m."conversationId" AND cm."userId" = ${me}
      WHERE m."deletedAt" IS NULL
        AND m.body ILIKE ${'%' + escaped + '%'} ESCAPE '\\'
      ORDER BY m."createdAt" DESC
      LIMIT 20
    `)
    const results: SearchResult[] = rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }))
    return results
  })
}
