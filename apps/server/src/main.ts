import { buildApp } from './app.js'
import { resolve } from 'node:path'
import { serveWeb } from './web.js'

const app = await buildApp()
if (process.env.WEB_DIST_DIR) await serveWeb(app, resolve(process.env.WEB_DIST_DIR))
const port = Number(process.env.PORT ?? 4000)
await app.listen({ port, host: process.env.HOST ?? '127.0.0.1' })

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void app.close().then(() => process.exit(0), () => process.exit(1))
  })
}
