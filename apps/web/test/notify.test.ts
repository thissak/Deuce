import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { conversationsKey } from '../src/api/queries'
import { maybeNotify } from '../src/lib/notify'
import { msg } from './cache.test'

class FakeNotification {
  static permission = 'granted'
  static instances: FakeNotification[] = []
  onclick: (() => void) | null = null
  constructor(
    readonly title: string,
    readonly options?: { body?: string },
  ) {
    FakeNotification.instances.push(this)
  }
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

describe('maybeNotify', () => {
  let qc: QueryClient
  beforeEach(() => {
    qc = new QueryClient()
    FakeNotification.instances = []
    FakeNotification.permission = 'granted'
    vi.stubGlobal('Notification', FakeNotification)
    setHidden(true)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    setHidden(false)
  })

  it('숨김 탭 + 타인 메시지면 알림을 만든다', () => {
    maybeNotify(qc, 'me1', msg({ body: '안녕하세요' }), () => {})
    expect(FakeNotification.instances).toHaveLength(1)
    expect(FakeNotification.instances[0]?.title).toBe('A')
  })

  it('내 메시지는 무시', () => {
    maybeNotify(qc, 'u1', msg({}), () => {}) // msg의 author.id = 'u1'
    expect(FakeNotification.instances).toHaveLength(0)
  })

  it('탭이 보이면 무시', () => {
    setHidden(false)
    maybeNotify(qc, 'me1', msg({}), () => {})
    expect(FakeNotification.instances).toHaveLength(0)
  })

  it('음소거된 방은 무시', () => {
    qc.setQueryData(conversationsKey, [{
      id: 'c1', type: 'DM', title: null, displayName: 'A', members: [],
      lastMessage: null, unreadCount: 0, mutedAt: '2026-08-29T00:00:00.000Z',
    }])
    maybeNotify(qc, 'me1', msg({ conversationId: 'c1' }), () => {})
    expect(FakeNotification.instances).toHaveLength(0)
  })

  it('권한이 없으면 무시', () => {
    FakeNotification.permission = 'default'
    maybeNotify(qc, 'me1', msg({}), () => {})
    expect(FakeNotification.instances).toHaveLength(0)
  })
})
