import staticFiles from '@fastify/static'
import type { FastifyInstance } from 'fastify'

// 앱 설치·업데이트 산출물 전용 디렉터리. 업로드/서버 소스/비밀 설정과 분리한다.
export async function serveDownloads(app: FastifyInstance, root: string) {
  await app.register(staticFiles, { root, prefix: '/downloads/', decorateReply: false, maxAge: 0,
    allowedPath: (path) => /^\/(?:index\.html|SHA256SUMS|latest(?:-mac(?:-arm64)?)?\.yml|Deuce-[A-Za-z0-9._-]+\.(?:dmg|zip|exe|blockmap))$/.test(path),
    setHeaders: (res) => { res.setHeader('X-Content-Type-Options', 'nosniff') },
  })
  app.get('/download', async (_req, reply) => reply.redirect('/downloads/index.html'))
}
