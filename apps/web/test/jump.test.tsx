import type { MessageDto, MessagePage } from '@deuce/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatView } from '../src/components/ChatView'
import { useJumpToMessage } from '../src/lib/useJumpToMessage'

function message(id: string): MessageDto {
  return {
    id, conversationId: 'c1',
    author: { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null },
    body: '본문', deleted: false, replyTo: null, reactions: [], mentions: [], attachments: [],
    createdAt: '2026-08-29T00:00:00.000Z', editedAt: null, pinnedAt: null,
  }
}

function pages(count: number, ids: string[] = []): MessagePage[] {
  return Array.from({ length: count }, (_, i) => ({
    items: i === 0 ? ids.map(message) : [],
    nextCursor: null,
  }))
}

const scrollIntoView = vi.fn()

beforeEach(() => {
  document.body.innerHTML = ''
  scrollIntoView.mockClear()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0)
    return 0
  })
  Element.prototype.scrollIntoView = scrollIntoView
})
afterEach(() => vi.unstubAllGlobals())

describe('useJumpToMessage 완료 통지', () => {
  it('대상이 로드돼 있으면 스크롤·하이라이트 후 onDone을 부른다', () => {
    document.body.innerHTML = '<div id="msg-m1"></div>'
    const q = {
      data: { pages: pages(1, ['m1']) },
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    }
    const onDone = vi.fn()
    const { result } = renderHook(() => useJumpToMessage(q, onDone))

    act(() => result.current('m1'))

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(document.getElementById('msg-m1')?.classList.contains('highlight')).toBe(true)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('아직 못 찾았고 더 불러올 게 있으면 fetchNextPage만 하고 onDone은 미룬다', () => {
    const q = {
      data: { pages: pages(1, ['other']) },
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn().mockResolvedValue(undefined),
    }
    const onDone = vi.fn()
    const { result } = renderHook(() => useJumpToMessage(q, onDone))

    act(() => result.current('m1'))

    expect(q.fetchNextPage).toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('더 불러올 게 없으면 중단하면서 onDone을 부른다', () => {
    const q = {
      data: { pages: pages(1, ['other']) },
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    }
    const onDone = vi.fn()
    const { result } = renderHook(() => useJumpToMessage(q, onDone))

    act(() => result.current('m1'))

    expect(q.fetchNextPage).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('20페이지를 다 뒤져도 못 찾으면 더 안 부르고 onDone으로 정리한다', () => {
    const q = {
      data: { pages: pages(20, ['other']) },
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    }
    const onDone = vi.fn()
    const { result } = renderHook(() => useJumpToMessage(q, onDone))

    act(() => result.current('m1'))

    expect(q.fetchNextPage).not.toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledTimes(1)
  })
})

// 훅 계약이 아니라 실제 화면 배선(ChatView의 setParams)을 통과시킨다
describe('ChatView 점프 파라미터 정리', () => {
  const me = { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null }
  const detail = {
    id: 'c1', type: 'GROUP', title: '팀방', displayName: '팀방', members: [me],
    lastMessage: null, unreadCount: 0, mutedAt: null, pinnedMessage: null,
  }

  function stubFetch(page: MessagePage) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((path: string, init?: RequestInit) => {
        const body =
          init?.method === 'PUT' ? { ok: true } : path.includes('/messages') ? page : detail
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        )
      }),
    )
  }

  function Probe() {
    return <span data-testid="search">{useLocation().search}</span>
  }

  function renderChat(entry: string) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[entry]}>
          <ChatView me={me} conversationId="c1" />
          <Probe />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('점프가 끝나면 URL에서 ?m=을 지운다', async () => {
    stubFetch({ items: [message('m1')], nextCursor: null })
    renderChat('/chat/c1?m=m1')
    expect(screen.getByTestId('search').textContent).toBe('?m=m1')

    await screen.findByText('본문')

    await waitFor(() => expect(screen.getByTestId('search').textContent).toBe(''))
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('대상을 못 찾고 멈출 때도 ?m=을 남기지 않는다', async () => {
    stubFetch({ items: [message('other')], nextCursor: null })
    renderChat('/chat/c1?m=zzz')

    await screen.findByText('본문')

    await waitFor(() => expect(screen.getByTestId('search').textContent).toBe(''))
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
