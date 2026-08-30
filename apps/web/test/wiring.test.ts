import { QueryClient } from '@tanstack/react-query'
import { RT } from '@deuce/shared'
import { describe, expect, it, vi } from 'vitest'
import { conversationsKey, messagesKey, presenceKey } from '../src/api/queries'
import type { MessagesData } from '../src/realtime/cache'
import type { AppSocket } from '../src/realtime/socket'
import { attachRealtime } from '../src/realtime/wiring'
import { msg } from './fixtures'

class FakeSocket {
  handlers = new Map<string, (...args: never[]) => void>()
  on(event: string, fn: (...args: never[]) => void) {
    this.handlers.set(event, fn)
    return this
  }
  off(event: string, fn: (...args: never[]) => void) {
    if (this.handlers.get(event) === fn) this.handlers.delete(event)
    return this
  }
  fire(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.(...(args as never[]))
  }
}

function setup() {
  const qc = new QueryClient()
  const socket = new FakeSocket()
  attachRealtime(socket as unknown as AppSocket, qc, 'me1')
  return { qc, socket }
}

function seedMessages(qc: QueryClient, conversationId: string, items = [msg({ id: 'seed', conversationId })]) {
  qc.setQueryData<MessagesData>(messagesKey(conversationId), {
    pages: [{ items, nextCursor: null }],
    pageParams: [''],
  })
}

describe('attachRealtime', () => {
  it('message.new → 해당 방 캐시 append + 목록 invalidate', () => {
    const { qc, socket } = setup()
    seedMessages(qc, 'c1')
    const spy = vi.spyOn(qc, 'invalidateQueries')
    socket.fire(RT.messageNew, msg({ id: 'n1', conversationId: 'c1' }))
    const d = qc.getQueryData<MessagesData>(messagesKey('c1'))
    expect(d?.pages[0]?.items[0]?.id).toBe('n1')
    expect(spy).toHaveBeenCalledWith({ queryKey: conversationsKey })
  })

  it('message.updated → 항목 교체 + 목록 invalidate (미리보기 본문 반영)', () => {
    const { qc, socket } = setup()
    seedMessages(qc, 'c1', [msg({ id: 'm1', conversationId: 'c1', body: '이전' })])
    const spy = vi.spyOn(qc, 'invalidateQueries')
    socket.fire(RT.messageUpdated, msg({ id: 'm1', conversationId: 'c1', body: '이후' }))
    const d = qc.getQueryData<MessagesData>(messagesKey('c1'))
    expect(d?.pages[0]?.items[0]?.body).toBe('이후')
    expect(spy).toHaveBeenCalledWith({ queryKey: conversationsKey })
  })

  it('reaction.changed → 항목 교체', () => {
    const { qc, socket } = setup()
    seedMessages(qc, 'c1', [msg({ id: 'm1', conversationId: 'c1' })])
    socket.fire(RT.reactionChanged, msg({ id: 'm1', conversationId: 'c1', reactions: [{ emoji: '👍', userIds: ['u2'] }] }))
    const d = qc.getQueryData<MessagesData>(messagesKey('c1'))
    expect(d?.pages[0]?.items[0]?.reactions).toHaveLength(1)
  })

  it('conversation.created 중복 수신은 invalidate만 하므로 무해하다 (이월)', () => {
    const { qc, socket } = setup()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    socket.fire(RT.conversationCreated, { conversationId: 'c9' })
    socket.fire(RT.conversationCreated, { conversationId: 'c9' })
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy).toHaveBeenCalledWith({ queryKey: conversationsKey })
  })

  it('conversation.removed → 그 방 캐시 제거', () => {
    const { qc, socket } = setup()
    seedMessages(qc, 'c1')
    socket.fire(RT.conversationRemoved, { conversationId: 'c1' })
    expect(qc.getQueryData(messagesKey('c1'))).toBeUndefined()
  })

  it('read.advanced는 내 것일 때만 목록 invalidate', () => {
    const { qc, socket } = setup()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    socket.fire(RT.readAdvanced, { conversationId: 'c1', userId: 'other', lastReadMessageId: 'x' })
    expect(spy).not.toHaveBeenCalled()
    socket.fire(RT.readAdvanced, { conversationId: 'c1', userId: 'me1', lastReadMessageId: 'x' })
    expect(spy).toHaveBeenCalledWith({ queryKey: conversationsKey })
  })

  it('presence.changed → 스냅샷 패치', () => {
    const { qc, socket } = setup()
    qc.setQueryData(presenceKey, {})
    socket.fire(RT.presenceChanged, { userId: 'u7', status: 'away' })
    expect(qc.getQueryData(presenceKey)).toEqual({ u7: 'away' })
  })

  it('presence.changed는 스냅샷을 아직 못 받았으면 캐시를 만들지 않는다', () => {
    const { qc, socket } = setup()
    socket.fire(RT.presenceChanged, { userId: 'u7', status: 'away' })
    expect(qc.getQueryData(presenceKey)).toBeUndefined()
  })

  it('connect → 전체 invalidate (초기 룸 조인 비동기 + 재접속 재동기화)', () => {
    const { qc, socket } = setup()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    socket.fire('connect')
    expect(spy).toHaveBeenCalledWith()
  })

  it('detach 후에는 이벤트가 캐시를 건드리지 않는다', () => {
    const qc = new QueryClient()
    const socket = new FakeSocket()
    const detach = attachRealtime(socket as unknown as AppSocket, qc, 'me1')
    seedMessages(qc, 'c1')
    detach()
    socket.fire(RT.messageNew, msg({ id: 'n1', conversationId: 'c1' }))
    expect(qc.getQueryData<MessagesData>(messagesKey('c1'))?.pages[0]?.items[0]?.id).toBe('seed')
  })
})
