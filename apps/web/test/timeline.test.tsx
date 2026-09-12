import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Timeline } from '../src/components/Timeline'
import { msg } from './fixtures'

const me = { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null }
// 서버는 최신순으로 준다 — m2가 최신
const page = { items: [msg({ id: 'm2', body: '나중' }), msg({ id: 'm1', body: '먼저' })], nextCursor: null }

function fetchStub() {
  return vi.fn().mockImplementation((_path: string, init?: RequestInit) =>
    Promise.resolve(
      new Response(JSON.stringify(init?.method === 'PUT' ? { ok: true } : page), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  )
}

function readCall(fn: ReturnType<typeof fetchStub>): [string, RequestInit] | undefined {
  return fn.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PUT') as
    | [string, RequestInit]
    | undefined
}

function renderTimeline(fn: ReturnType<typeof fetchStub>) {
  vi.stubGlobal('fetch', fn)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <Timeline me={me} conversationId="c1" members={[me]} onReply={() => {}} />
    </QueryClientProvider>,
  )
}

afterEach(() => {
  delete window.deuceDesktop
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Timeline', () => {
  it('데스크톱 창이 뒤에 있으면 새 글을 읽지 않고 포커스 복귀 때 처리한다', async () => {
    window.deuceDesktop = { focus: vi.fn(), setUnreadCount: vi.fn() }
    const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    const fn = fetchStub()
    renderTimeline(fn)
    await screen.findByText('먼저')
    expect(readCall(fn)).toBeUndefined()
    focused.mockReturnValue(true)
    fireEvent.focus(window)
    await waitFor(() => expect(readCall(fn)).toBeTruthy())
    fireEvent.focus(window)
    expect(fn.mock.calls.filter((c) => c[1]?.method === 'PUT')).toHaveLength(1)
  })

  it('"이전 메시지 보기"는 과거 페이지가 그려진 뒤 늘어난 높이만큼 scrollTop을 보정한다', async () => {
    // 실 Chrome에서 관측한 순서 — react-query 알림(setTimeout 배치)보다 rAF가 먼저 돌아 커밋 전에 보정이 실행됐다
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    const older = { items: [msg({ id: 'm0', body: '더 먼저' })], nextCursor: null }
    const fn = vi.fn().mockImplementation((path: string, init?: RequestInit) => {
      const body = init?.method === 'PUT' ? { ok: true } : path.includes('cursor=') ? older : { ...page, nextCursor: 'm1' }
      return Promise.resolve(
        new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
      )
    })
    renderTimeline(fn)
    await screen.findByText('먼저')
    const list = screen.getByText('먼저').closest('.timeline') as HTMLElement
    // jsdom은 레이아웃이 없다 — 행 수에 비례하는 높이와 값이 저장되는 scrollTop을 흉내 낸다
    Object.defineProperty(list, 'scrollHeight', { get: () => list.querySelectorAll('.msg-row').length * 100 })
    Object.defineProperty(list, 'clientHeight', { get: () => 100 })
    Object.defineProperty(list, 'scrollTop', { value: 0, writable: true })
    fireEvent.scroll(list) // 위(과거)를 읽는 중 — 하단 추종 해제
    fireEvent.click(screen.getByRole('button', { name: '이전 메시지 보기' }))
    await screen.findByText('더 먼저')
    expect(list.scrollTop).toBe(100) // 2행(200) → 3행(300): 늘어난 만큼 내려가 같은 메시지가 보인다
  })

  it('최신순 페이지를 역순으로 그린다 (위가 과거)', async () => {
    renderTimeline(fetchStub())
    await screen.findByText('먼저')
    const ids = [...document.querySelectorAll('.msg-row')].map((e) => e.id)
    expect(ids).toEqual(['msg-m1', 'msg-m2'])
  })

  it('최신 메시지 id로 읽음 커서를 전진시킨다', async () => {
    const fn = fetchStub()
    renderTimeline(fn)
    await screen.findByText('먼저')
    await waitFor(() => expect(readCall(fn)).toBeTruthy())
    const [path, init] = readCall(fn)!
    expect(path).toBe('/api/conversations/c1/read')
    expect(JSON.parse(init.body as string)).toEqual({ messageId: 'm2' })
  })

  it('탭이 숨겨져 있으면 보이게 될 때 보낸다', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    const fn = fetchStub()
    renderTimeline(fn)
    await screen.findByText('먼저')
    expect(readCall(fn)).toBeUndefined()

    hidden.mockReturnValue(false)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(readCall(fn)).toBeTruthy())
  })
})
