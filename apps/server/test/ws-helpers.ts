import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client'

export async function listen(app: FastifyInstance): Promise<number> {
  await app.listen({ port: 0, host: '127.0.0.1' })
  return (app.server.address() as AddressInfo).port
}

export function wsConnect(port: number, cookie: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      extraHeaders: { cookie },
      reconnection: false,
    })
    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', (err) => {
      socket.close()
      reject(err)
    })
  })
}

export function waitForEvent<T>(socket: ClientSocket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${event}`)),
      timeoutMs,
    )
    socket.once(event, (payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}
