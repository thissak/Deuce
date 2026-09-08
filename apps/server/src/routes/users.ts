import type { FastifyPluginAsync } from 'fastify'
import { prisma } from '../db.js'
import { toUserDto } from '../serializers.js'

export const userRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.authenticate)

  app.get('/users', async () => {
    const users = await prisma.user.findMany({ where: { isAgent: false }, orderBy: { name: 'asc' } })
    return users.map(toUserDto)
  })
}
