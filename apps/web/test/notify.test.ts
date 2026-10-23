import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { conversationsKey } from '../src/api/queries'
import { maybeNotify } from '../src/lib/notify'
import { msg } from './fixtures'

class FakeNotification {
  static permission = 'granted'
  static instances: FakeNotification[] = []
  onclick: (() => void) | null = null
  constructor(
    readonly title: string,
    readonly options?: { body?: string; tag?: string },
  ) {
    FakeNotification.instances.push(this)
  }
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true })
}

function setFocused(focused: boolean) {
  vi.spyOn(document, 'hasFocus').mockReturnValue(focused)
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
    vi.restoreAllMocks()
    setHidden(false)
  })

  it('숨김 탭 + 타인 메시지면 알림을 만든다', () => {
    maybeNotify(qc, 'me1', msg({ body: '안녕하세요' }), () => {})
    expect(FakeNotification.instances).toHaveLength(1)
    expect(FakeNotification.instances[0]?.title).toBe('A')
    // 여러 창이 같은 메시지를 알려도 OS가 하나로 합치도록 메시지 ID를 tag로 쓴다.
    expect(FakeNotification.instances[0]?.options?.tag).toBe(msg({}).id)
  })

  it('내 메시지는 무시', () => {
    maybeNotify(qc, 'u1', msg({}), () => {}) // msg의 author.id = 'u1'
    expect(FakeNotification.instances).toHaveLength(0)
  })

  it('창이 보이고 포커스가 있으면 무시', () => {
    setHidden(false)
    setFocused(true)
    maybeNotify(qc, 'me1', msg({}), () => {})
    expect(FakeNotification.instances).toHaveLength(0)
  })

  it('창이 보여도 포커스를 잃었으면 알림을 만든다', () => {
    setHidden(false)
    setFocused(false)
    maybeNotify(qc, 'me1', msg({ body: '뒤에 가려진 창' }), () => {})
    expect(FakeNotification.instances).toHaveLength(1)
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

  it('삭제 메시지는 알림하지 않는다', () => {
    maybeNotify(qc, 'me1', msg({ deleted: true }), () => {})
    expect(FakeNotification.instances).toHaveLength(0)
  })

  it('알림 클릭 시 창 포커스 + 해당 방을 연다', () => {
    const onOpen = vi.fn()
    const focus = vi.spyOn(window, 'focus').mockImplementation(() => {})
    maybeNotify(qc, 'me1', msg({ conversationId: 'c7' }), onOpen)
    FakeNotification.instances[0]?.onclick?.()
    expect(focus).toHaveBeenCalled()
    expect(onOpen).toHaveBeenCalledWith('c7')
    focus.mockRestore()
  })
})
