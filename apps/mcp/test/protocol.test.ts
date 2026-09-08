import { createServer } from 'node:http'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'
import { randomBytes, randomUUID } from 'node:crypto'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { expect, it } from 'vitest'
import { validateConnection } from '../src/server.js'

it('실제 stdio initialize/tools 호출로 HTTP 인증·메시지·첨부를 연결한다', async () => {
  const token = `deuce_${randomBytes(32).toString('base64url')}`
  const seen: { method: string; url: string; body: string }[] = []
  const http = createServer(async (req, res) => {
    expect(req.headers.authorization).toBe(`Bearer ${token}`)
    let body = ''; for await (const chunk of req) body += chunk
    seen.push({ method: req.method!, url: req.url!, body })
    res.setHeader('content-type', 'application/json')
    if (req.url?.startsWith('/api/agent/attachments/')) res.end(JSON.stringify({ id: randomUUID(), fileName: 'notes.txt', mimeType: 'text/plain', base64: Buffer.from('자료 본문').toString('base64') }))
    else res.end(JSON.stringify(req.method === 'POST' ? { id: 'posted' } : { title: '요구사항', items: [] }))
  })
  http.listen(0, '127.0.0.1'); await once(http, 'listening')
  const address = http.address() as { port: number }
  const env = Object.fromEntries(Object.entries(process.env).filter((x): x is [string, string] => x[1] !== undefined))
  const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', fileURLToPath(new URL('../src/main.ts', import.meta.url))],
    cwd: fileURLToPath(new URL('..', import.meta.url)), env: { ...env, DEUCE_URL: `http://127.0.0.1:${address.port}`, DEUCE_AGENT_TOKEN: token }, stderr: 'pipe' })
  const client = new Client({ name: 'deuce-protocol-test', version: '1.0.0' })
  try {
    await client.connect(transport)
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['list_conversations', 'get_channel', 'get_conversation', 'read_messages', 'search_messages', 'post_message', 'read_attachment'])
    const context = await client.callTool({ name: 'get_channel' }); expect(JSON.stringify(context)).toContain('요구사항')
    await client.callTool({ name: 'read_messages', arguments: { limit: 2 } })
    await client.callTool({ name: 'search_messages', arguments: { query: '조사 & 자료' } })
    expect((await client.callTool({ name: 'post_message', arguments: { body: 'AI 의견' } })).isError).not.toBe(true)
    expect((await client.callTool({ name: 'post_message', arguments: { body: '' } })).isError).toBe(true)
    const file = await client.callTool({ name: 'read_attachment', arguments: { attachmentId: randomUUID() } })
    expect(JSON.stringify(file)).toContain('자료 본문')
    expect(seen.filter((r) => r.method === 'POST')).toHaveLength(1)
    expect(seen.find((r) => r.method === 'POST')!.body).toBe(JSON.stringify({ body: 'AI 의견' }))
    expect(JSON.stringify(context)).not.toContain(token)
    const conversationId = randomUUID()
    await client.callTool({ name: 'list_conversations', arguments: { limit: 1 } })
    await client.callTool({ name: 'read_messages', arguments: { conversationId, limit: 2 } })
    await client.callTool({ name: 'read_attachment', arguments: { conversationId, attachmentId: randomUUID() } })
    await client.callTool({ name: 'post_message', arguments: { conversationId, body: '지정한 방 의견' } })
    expect(seen.some((r) => r.url === `/api/agent/messages?conversationId=${conversationId}&limit=2`)).toBe(true)
    expect(seen.some((r) => r.url.startsWith('/api/agent/attachments/') && r.url.endsWith(`?conversationId=${conversationId}`))).toBe(true)
    expect(JSON.parse(seen.at(-1)!.body)).toEqual({ conversationId, body: '지정한 방 의견' })
  } finally { await client.close(); http.close(); http.closeAllConnections() }
})

it('원격 평문·자격증명 포함 URL과 잘못된 키를 차단한다', () => {
  const token = `deuce_${randomBytes(32).toString('base64url')}`
  for (const baseUrl of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com/?token=secret'])
    expect(() => validateConnection({ baseUrl, token })).toThrow()
  expect(() => validateConnection({ baseUrl: 'https://deuce.goldenlabs.dev', token })).not.toThrow()
})
