import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
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
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Timeline', () => {
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
