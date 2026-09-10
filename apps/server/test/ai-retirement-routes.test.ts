import { expect, it } from 'vitest'
import { io } from 'socket.io-client'
import { buildApp } from '../src/app.js'

it('retired AI and MCP endpoints are unavailable even with a legacy bearer header', async () => {
  const app = await buildApp()
  try {
    for (const url of ['/api/agents', '/api/agent/conversations', '/api/agent/messages', '/api/conversations/room/agents', '/mcp']) {
      const response = await app.inject({ url, headers: { authorization: 'Bearer legacy-key' } })
      expect(response.statusCode, url).toBe(404)
    }
    for (const url of ['/api/agents', '/api/agent/messages', '/api/conversations/room/agents/bot/requests', '/mcp']) {
      const response = await app.inject({ method: 'POST', url, payload: {}, headers: { authorization: 'Bearer legacy-key' } })
      expect(response.statusCode, url).toBe(404)
    }
    expect((await app.inject({ url: '/health' })).statusCode).toBe(200)
  } finally { await app.close() }
})

it('old desktop runners cannot connect to the retired namespace', async () => {
  const app = await buildApp()
  const origin = await app.listen({ host: '127.0.0.1', port: 0 })
  const socket = io(`${origin}/agent-runner`, { autoConnect: false, transports: ['websocket'], reconnection: false })
  try {
    const error = await new Promise<Error>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('runner connection did not finish')), 3000)
      socket.once('connect_error', error => { clearTimeout(timer); resolve(error) })
      socket.once('connect', () => { clearTimeout(timer); reject(new Error('retired runner connected')) })
      socket.connect()
    })
    expect(error.message).toBe('Invalid namespace')
  } finally { socket.disconnect(); await app.close() }
})
