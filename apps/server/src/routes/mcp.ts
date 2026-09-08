import type { FastifyPluginAsync } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServerWithRequest } from '@deuce/mcp/server'
import type { AppConfig } from '../config.js'
import { authenticateAgent } from './agents.js'
import { requestTrace } from '../observability.js'

export const mcpRoutes: FastifyPluginAsync<{ config: AppConfig }> = async (app, { config }) => {
  const origin = new URL(config.google.callbackUrl).origin
  const identities = new WeakMap<object, string>()
  app.addHook('onRequest', async (req, reply) => {
    reply.header('cache-control', 'no-store')
    if (req.headers.origin !== undefined && req.headers.origin !== origin)
      return reply.code(403).send({ error: 'invalid origin' })
    const agent = await authenticateAgent(req.headers.authorization, config)
    if (!agent) return reply.header('www-authenticate', 'Bearer realm="deuce"').code(401).send({ error: 'invalid agent credential' })
    identities.set(req, agent.id)
    req.log.info({ event: 'mcp.access', agentId: agent.id, conversationId: agent.conversationId }, 'MCP access')
  })
  await app.register(rateLimit, { global: false })
  app.route({ method: ['POST', 'GET', 'DELETE'], url: '/mcp', bodyLimit: 64 * 1024,
    preHandler: app.rateLimit({ max: 120, timeWindow: '1 minute', keyGenerator: (req) => identities.get(req)! }),
    handler: async (req, reply) => {
      // 상시 SSE·세션 저장소 없이 요청마다 독립 인스턴스. 키가 바뀌어도 이전 채널 상태가 섞이지 않는다.
      if (req.method !== 'POST') return reply.header('allow', 'POST').code(405).send({ error: 'use POST; no background stream' })
      const server = createMcpServerWithRequest(async (path, body) => {
        const result = await app.inject({ method: body ? 'POST' : 'GET', url: `/api/agent${path}`,
          headers: { authorization: req.headers.authorization!, 'x-deuce-trace-id': requestTrace.getStore()?.traceId ?? req.id },
          ...(body ? { payload: body } : {}) })
        if (result.statusCode >= 400) throw new Error(`Deuce request failed (${result.statusCode}). Check access or input. Verify uncertain writes before retrying.`)
        return result.json()
      })
      const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true })
      try {
        await server.connect(transport)
        const headers = new Headers()
        for (const name of ['accept', 'content-type', 'mcp-protocol-version']) {
          const value = req.headers[name]
          if (typeof value === 'string') headers.set(name, value)
        }
        const response = await transport.handleRequest(new Request(`${origin}/mcp`, { method: 'POST', headers }), { parsedBody: req.body })
        response.headers.forEach((value, name) => reply.header(name, value))
        return reply.code(response.status).send(await response.text())
      } finally { await server.close() }
    },
  })
}
