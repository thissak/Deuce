import { randomUUID } from 'node:crypto'
import { beforeEach, expect, it, vi } from 'vitest'
import { io, type Socket } from 'socket.io-client'
import { makeTestApp } from './api-helpers.js'
import { resetDb, testDb } from './helpers.js'

beforeEach(resetDb)
async function fixture() {
  const { app, loginAs } = await makeTestApp()
  const cookie = await loginAs('a@goldenlabs.dev', 'A'), peerCookie = await loginAs('b@goldenlabs.dev', 'B'), outsiderCookie = await loginAs('c@goldenlabs.dev', 'C')
  const peer = await testDb.user.findUniqueOrThrow({ where: { email: 'b@goldenlabs.dev' } })
  const room = (await app.inject({ method: 'POST', url: '/api/conversations', headers: { cookie }, payload: { type: 'dm', otherUserId: peer.id } })).json()
  const agent = (await app.inject({ method: 'POST', url: '/api/agents', headers: { cookie }, payload: { name: 'Codex' } })).json()
  const url = `/api/conversations/${room.id}/agents/${agent.id}`
  await app.inject({ method: 'PUT', url, headers: { cookie }, payload: { excluded: false } })
  await app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.server.address() as { port: number }
  const socket: Socket = io(`http://127.0.0.1:${address.port}/agent-runner`, { autoConnect: false, transports: ['websocket'], auth: { token: agent.token, provider: 'codex' } })
  await new Promise<void>((resolve, reject) => { socket.once('ready', () => resolve()); socket.once('connect_error', reject); socket.connect() })
  return { app, socket, cookie, peerCookie, outsiderCookie, room, agent, url }
}
it('실행 연결을 확인하고 다른 사람의 요청에도 같은 방에서 AI 신원으로 한 번 답한다', async () => {
  const { app, socket, peerCookie, outsiderCookie, room, agent, url } = await fixture()
  try {
    let dispatched = 0
    socket.on('run', (task) => { dispatched++; expect(task.conversationId).toBe(room.id); socket.emit('result', { id: task.id, body: '대화 내용을 정리했습니다.' }) })
    expect((await app.inject({ url: `/api/conversations/${room.id}/agents`, headers: { cookie: peerCookie } })).json()[0].runtime).toBe('READY')
    const id = randomUUID(), payload = { id, prompt: '요약해 주세요' }
    const request = () => app.inject({ method: 'POST', url: `${url}/requests`, headers: { cookie: peerCookie }, payload })
    expect((await app.inject({ method: 'POST', url: `${url}/requests`, headers: { cookie: outsiderCookie }, payload })).statusCode).toBe(403)
    expect((await request()).statusCode).toBe(202)
    await vi.waitFor(async () => expect((await testDb.agentRun.findUniqueOrThrow({ where: { id } })).status).toBe('COMPLETED'))
    expect((await request()).statusCode).toBe(200)
    expect(dispatched).toBe(1)
    const run = await testDb.agentRun.findUniqueOrThrow({ where: { id } })
    const response = await testDb.message.findUniqueOrThrow({ where: { id: run.resultMessageId! }, include: { author: true } })
    expect(response).toMatchObject({ conversationId: room.id, replyToId: run.questionMessageId, author: { isAgent: true, name: 'Codex' } })
    expect((await app.inject({ method: 'POST', url: `${url}/requests`, headers: { cookie: peerCookie }, payload: { id, prompt: '다른 요청' } })).statusCode).toBe(409)
    expect(agent.token).not.toBe((await testDb.agentConnection.findUniqueOrThrow({ where: { id: agent.id } })).tokenHash)
  } finally { socket.disconnect(); await app.close() }
})
it('실행 중 내보내면 요청을 실패 처리하고 뒤늦은 AI 답변을 게시하지 않는다', async () => {
  const { app, socket, cookie, room, url } = await fixture()
  try {
    let taskId = ''
    socket.on('run', task => { taskId = task.id })
    const id = randomUUID()
    await app.inject({ method: 'POST', url: `${url}/requests`, headers: { cookie }, payload: { id, prompt: '오래 걸리는 요청' } })
    await vi.waitFor(() => expect(taskId).toBe(id))
    expect((await app.inject({ method: 'POST', url: `${url}/requests`, headers: { cookie }, payload: { id: randomUUID(), prompt: '중복 실행' } })).statusCode).toBe(409)
    await app.inject({ method: 'PUT', url, headers: { cookie }, payload: { excluded: true } })
    socket.emit('result', { id, body: '뒤늦은 답변' })
    await vi.waitFor(async () => expect((await testDb.agentRun.findUniqueOrThrow({ where: { id } })).status).toBe('FAILED'))
    expect(await testDb.message.count({ where: { conversationId: room.id, author: { isAgent: true } } })).toBe(0)
  } finally { socket.disconnect(); await app.close() }
})
it('채팅의 AI 멘션을 실행하고 응답 유실 재전송에서도 같은 메시지·요청을 재사용한다', async () => {
  const { app, socket, cookie, room, agent } = await fixture()
  try {
    let calls = 0
    socket.on('run', task => { calls++; socket.emit('result', { id: task.id, body: '멘션 답변' }) })
    const a = await testDb.agentConnection.findUniqueOrThrow({ where: { id: agent.id } })
    const payload = { body: '@Codex 요약해 주세요', mentions: [a.userId], clientMessageId: randomUUID() }
    const send = () => app.inject({ method: 'POST', url: `/api/conversations/${room.id}/messages`, headers: { cookie }, payload })
    expect((await send()).statusCode).toBe(201)
    await vi.waitFor(() => expect(calls).toBe(1))
    expect((await send()).statusCode).toBe(201)
    await vi.waitFor(async () => expect((await testDb.agentRun.findUniqueOrThrow({ where: { id: payload.clientMessageId } })).status).toBe('COMPLETED'))
    expect(calls).toBe(1)
  } finally { socket.disconnect(); await app.close() }
})
it('재시작 후 남은 만료 요청은 한 번 실패 기록을 남기고 새 멘션을 막지 않는다', async () => {
  const { app, socket, cookie, room, agent } = await fixture()
  try {
    const a = await testDb.agentConnection.findUniqueOrThrow({ where: { id: agent.id } })
    const question = await testDb.message.create({ data: { conversationId: room.id, authorId: a.ownerId, body: '이전 요청' } })
    const stale = await testDb.agentRun.create({ data: { id: randomUUID(), conversationId: room.id, agentId: a.id, requestedById: a.ownerId,
      questionMessageId: question.id, prompt: '이전 요청', createdAt: new Date(Date.now() - 200_000) } })
    socket.on('run', task => socket.emit('result', { id: task.id, body: '새 답변' }))
    const payload = { body: '@Codex 새 요청', mentions: [a.userId], clientMessageId: randomUUID() }
    expect((await app.inject({ method: 'POST', url: `/api/conversations/${room.id}/messages`, headers: { cookie }, payload })).statusCode).toBe(201)
    await vi.waitFor(async () => expect((await testDb.agentRun.findUniqueOrThrow({ where: { id: payload.clientMessageId } })).status).toBe('COMPLETED'))
    await app.agentRuntime.expire({ agentId: a.id })
    expect((await testDb.agentRun.findUniqueOrThrow({ where: { id: stale.id } })).errorCode).toBe('TIMEOUT')
    expect(await testDb.message.count({ where: { replyToId: question.id, system: true } })).toBe(1)
  } finally { socket.disconnect(); await app.close() }
})
