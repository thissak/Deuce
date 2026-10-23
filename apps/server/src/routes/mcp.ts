import type { FastifyPluginAsync } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createAgentMcpServer } from '../mcp/tools.js'
import type { AppConfig } from '../config.js'
import { authenticateAgent } from '../domain/agents.js'
import { requestTrace } from '../observability.js'

/** 원격 Streamable HTTP MCP. 상시 스트림·세션 저장소 없이 요청마다 새 서버를 만든다. */
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
      if (req.method !== 'POST') return reply.header('allow', 'POST').code(405).send({ error: 'use POST; no background stream' })
      const server = createAgentMcpServer(async (path, body) => {
        const result = await app.inject({ method: body ? 'POST' : 'GET', url: `/api/agent${path}`,
          headers: { authorization: req.headers.authorization!, 'x-deuce-trace-id': requestTrace.getStore()?.traceId ?? req.id },
          ...(body ? { payload: body } : {}) })
        if (result.statusCode >= 400) {
          // 서버가 정한 짧은 오류 코드만 돌려준다. 키와 입력 원문은 포함하지 않는다.
          const code = (() => { try { const e = result.json().error; return typeof e === 'string' ? e : '' } catch { return '' } })()
          throw new Error(`Deuce request failed (${result.statusCode}${code ? `: ${code}` : ''}).`)
        }
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
