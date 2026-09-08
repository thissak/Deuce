import { readFileSync } from 'node:fs'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createMcpServer, validateConnection } from './server.js'

async function main() {
  const index = process.argv.indexOf('--config')
  const path = index >= 0 ? process.argv[index + 1] : undefined
  const config = validateConnection(path ? JSON.parse(readFileSync(path, 'utf8')) : {
    baseUrl: process.env.DEUCE_URL, token: process.env.DEUCE_AGENT_TOKEN,
  })
  await createMcpServer(config).connect(new StdioServerTransport())
}
main().catch(() => { console.error('Deuce MCP could not start. Check --config or DEUCE_URL / DEUCE_AGENT_TOKEN.'); process.exitCode = 1 })
