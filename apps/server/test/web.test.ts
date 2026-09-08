import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { expect, test } from 'vitest'
import { serveWeb } from '../src/web.js'

test('배포 SPA 라우팅은 API와 없는 정적 자산을 가리지 않는다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'deuce-web-'))
  const app = Fastify()
  try {
    await writeFile(join(root, 'index.html'), '<html>Deuce</html>')
    await writeFile(join(root, 'app.js'), 'window.deuce = true')
    app.get('/auth/me', (_, reply) => reply.code(401).send({ error: 'unauthorized' }))
    await serveWeb(app, root)
    for (const url of ['/', '/chat/room-id', '/activity']) {
      const response = await app.inject(url)
      expect(response.statusCode).toBe(200)
      expect(response.body).toBe('<html>Deuce</html>')
      expect(response.headers['cache-control']).toContain('max-age=0')
    }
    expect((await app.inject('/app.js')).body).toContain('window.deuce')
    expect((await app.inject('/auth/me')).statusCode).toBe(401)
    for (const url of ['/api/missing', '/auth/missing', '/assets/missing.js', '/.env']) {
      expect((await app.inject(url)).statusCode).toBe(404)
    }
    expect((await app.inject({ method: 'POST', url: '/chat/a' })).statusCode).toBe(404)
  } finally {
    await app.close()
    await rm(root, { recursive: true, force: true })
  }
})
