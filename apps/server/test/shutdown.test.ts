import { once } from 'node:events'
import { expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

it('열린 WebSocket이 있어도 서버 종료가 완료된다', async () => {
  const app = await buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  // Namespace 로그인 이전의 transport도 종료 대상이다.
  const socket = new WebSocket(`${app.listeningOrigin.replace('http:', 'ws:')}/socket.io/?EIO=4&transport=websocket`)
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await once(socket, 'open')
    const closed = once(socket, 'close')
    await Promise.race([
      app.close(),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('shutdown waited for client')), 2000) }),
    ])
    await closed
    expect(app.server.listening).toBe(false)
  } finally {
    clearTimeout(timeout)
    socket.close()
    await app.close()
  }
})
