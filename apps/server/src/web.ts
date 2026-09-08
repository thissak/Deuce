import { access } from 'node:fs/promises'
import { join } from 'node:path'
import staticFiles from '@fastify/static'
import type { FastifyInstance } from 'fastify'

// 빌드된 SPA만 공개한다. API 오타·없는 자산에는 HTML을 반환하지 않는다.
export async function serveWeb(app: FastifyInstance, root: string): Promise<void> {
  await access(join(root, 'index.html'))
  await app.register(staticFiles, { root, maxAge: 0 })
  app.setNotFoundHandler((req, reply) => {
    const pathname = new URL(req.url, 'http://localhost').pathname
    const isPage = pathname === '/' || /^\/(chat|activity)(\/|$)/.test(pathname)
    if ((req.method === 'GET' || req.method === 'HEAD') && isPage) {
      return reply.sendFile('index.html', { maxAge: 0, immutable: false })
    }
    return reply.code(404).send({ error: 'not found' })
  })
}
