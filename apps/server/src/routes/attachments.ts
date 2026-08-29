import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import type { FastifyPluginAsync } from 'fastify'
import { RT, type SharedFile } from '@deuce/shared'
import { prisma } from '../db.js'
import { isMember } from '../domain/conversations.js'
import { messageInclude, toMessageDto } from '../serializers.js'
import type { FileStorage } from '../storage.js'

export interface AttachmentDeps {
  storage: FileStorage
}

export const attachmentRoutes: FastifyPluginAsync<AttachmentDeps> = async (app, deps) => {
  app.addHook('preHandler', app.authenticate)

  app.post('/conversations/:id/attachments', async (req, reply) => {
    const { id } = req.params as { id: string }
    const me = req.currentUser.id
    if (!(await isMember(id, me))) return reply.code(403).send({ error: 'not a member' })
    const data = await req.file()
    if (!data) return reply.code(400).send({ error: 'file required' })
    const captionField = data.fields['body']
    const caption =
      captionField && 'value' in captionField ? String(captionField.value).slice(0, 4000) : ''
    const objectKey = `${randomUUID()}${extname(data.filename).slice(0, 11)}`
    let size: number
    try {
      size = (await deps.storage.save(objectKey, data.file)).size
    } catch (err) {
      await deps.storage.delete(objectKey).catch((delErr: unknown) => {
        req.log.warn({ err: delErr, objectKey }, 'failed to remove partial upload after save error')
      })
      throw err
    }
    if (data.file.truncated) {
      await deps.storage.delete(objectKey).catch((delErr: unknown) => {
        req.log.warn({ err: delErr, objectKey }, 'failed to remove truncated upload')
      })
      return reply.code(413).send({ error: 'file too large' })
    }
    const created = await prisma.message.create({
      data: {
        conversationId: id,
        authorId: me,
        body: caption,
        attachments: {
          create: {
            objectKey,
            fileName: data.filename,
            size,
            contentType: data.mimetype,
          },
        },
      },
      include: messageInclude,
    })
    const dto = toMessageDto(created)
    app.io.to(`convo:${id}`).emit(RT.messageNew, dto)
    return reply.code(201).send(dto)
  })

  app.get('/attachments/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const attachment = await prisma.attachment.findUnique({
      where: { id },
      include: { message: true },
    })
    if (
      !attachment ||
      attachment.message.deletedAt ||
      !(await isMember(attachment.message.conversationId, req.currentUser.id))
    ) {
      return reply.code(404).send({ error: 'attachment not found' })
    }
    const stream = await deps.storage.createReadStream(attachment.objectKey)
    reply.header('content-type', attachment.contentType)
    reply.header(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    )
    return reply.send(stream)
  })

  app.get('/conversations/:id/attachments', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!(await isMember(id, req.currentUser.id)))
      return reply.code(403).send({ error: 'not a member' })
    const rows = await prisma.attachment.findMany({
      where: { message: { conversationId: id, deletedAt: null } },
      include: { message: { select: { createdAt: true } } },
      orderBy: { message: { createdAt: 'desc' } },
    })
    const files: SharedFile[] = rows.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      size: a.size,
      contentType: a.contentType,
      messageId: a.messageId,
      createdAt: a.message.createdAt.toISOString(),
    }))
    return files
  })
}
