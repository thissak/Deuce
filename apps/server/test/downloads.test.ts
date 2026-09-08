import { expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import { serveDownloads } from '../src/downloads.js'

it('설치 파일·업데이트 피드와 범위 다운로드를 제공하고 다른 파일은 차단한다', async () => {
  const root = await mkdtemp(join(tmpdir(), 'deuce-download-test-'))
  const app = Fastify()
  try {
    await writeFile(join(root, 'Deuce-0.1.0-win-x64.exe'), 'installer')
    await writeFile(join(root, 'latest.yml'), 'version: 0.1.0')
    await writeFile(join(root, 'private.json'), '{"secret":true}')
    await writeFile(join(root, 'index.html'), '<h1>Deuce</h1>')
    await serveDownloads(app, root)
    expect((await app.inject('/download')).headers.location).toBe('/downloads/index.html')
    expect((await app.inject('/downloads/index.html')).statusCode).toBe(200)
    expect((await app.inject('/downloads/latest.yml')).statusCode).toBe(200)
    expect((await app.inject('/downloads/private.json')).statusCode).toBe(404)
    const range = await app.inject({ url: '/downloads/Deuce-0.1.0-win-x64.exe', headers: { range: 'bytes=0-3' } })
    expect(range.statusCode).toBe(206); expect(range.body).toBe('inst')
  } finally { await app.close(); await rm(root, { recursive: true, force: true }) }
})
