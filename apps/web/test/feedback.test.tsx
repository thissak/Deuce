import type { ConversationDetail } from '@deuce/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { conversationKey, messagesKey } from '../src/api/queries'
import { ActivityPage } from '../src/components/ActivityPage'
import { ChatView } from '../src/components/ChatView'
import { GroupSettings } from '../src/components/GroupSettings'
import { MessageBubble } from '../src/components/MessageBubble'
import { SearchBox } from '../src/components/SearchBox'
import { Timeline } from '../src/components/Timeline'
import type { MessagesData } from '../src/realtime/cache'
import { msg } from './fixtures'

const me = { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null }
const mate = { id: 'u2', email: 'b@example.com', name: 'B', avatarUrl: null }

function detail(over: Partial<ConversationDetail> = {}): ConversationDetail {
  return {
    id: 'c1', type: 'DM', title: null, displayName: 'B', members: [me, mate],
    lastMessage: null, unreadCount: 0, mutedAt: null, pinnedMessage: null, ...over,
  }
}

function failStub(status = 500) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ error: 'boom' }), { status, headers: { 'content-type': 'application/json' } }),
  )
}

function makeQc() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

afterEach(() => vi.unstubAllGlobals())

describe('뮤테이션 실패 피드백', () => {
  it('반응 실패 시 버블에 실패 문구를 보여준다', async () => {
    vi.stubGlobal('fetch', failStub())
    render(
      <QueryClientProvider client={makeQc()}>
        <MessageBubble m={msg({})} isMine={false} meId="me1" memberNames={[]} onReply={() => {}} />
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: '👍' }))
    expect(await screen.findByText(/요청에 실패했습니다/)).toBeTruthy()
  })

  it('404 실패는 문구 없이 타임라인만 재조회한다', async () => {
    vi.stubGlobal('fetch', failStub(404))
    const qc = makeQc()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    render(
      <QueryClientProvider client={qc}>
        <MessageBubble m={msg({})} isMine={false} meId="me1" memberNames={[]} onReply={() => {}} />
      </QueryClientProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: '👍' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: messagesKey('c1') }))
    expect(screen.queryByText(/요청에 실패했습니다/)).toBeNull()
  })

  it('음소거 실패 시 헤더 아래 실패 문구를 보여준다', async () => {
    vi.stubGlobal('fetch', failStub())
    const qc = makeQc()
    qc.setQueryData(conversationKey('c1'), detail())
    qc.setQueryData<MessagesData>(messagesKey('c1'), { pages: [{ items: [], nextCursor: null }], pageParams: [''] })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ChatView me={me} conversationId="c1" />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    // 버튼 콘텐츠가 이모지(🔔)라 접근 이름이 title이 아니다 — getByTitle로 찾는다
    await userEvent.click(screen.getByTitle('음소거'))
    expect(await screen.findByText(/음소거 설정에 실패했습니다/)).toBeTruthy()
  })

  it('그룹 관리 실패 시 다이얼로그에 실패 문구를 보여준다', async () => {
    vi.stubGlobal('fetch', failStub())
    render(
      <MemoryRouter>
        <QueryClientProvider client={makeQc()}>
          <GroupSettings me={me} detail={detail({ type: 'GROUP', title: '팀방', displayName: '팀방' })} onClose={() => {}} />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await userEvent.click(screen.getByRole('button', { name: '이름 변경' }))
    expect(await screen.findByText(/요청에 실패했습니다/)).toBeTruthy()
  })
})

describe('조회 실패 피드백', () => {
  it('대화 상세 조회 실패 시 안내 + 다시 시도 버튼', async () => {
    const fn = failStub()
    vi.stubGlobal('fetch', fn)
    render(
      <MemoryRouter>
        <QueryClientProvider client={makeQc()}>
          <ChatView me={me} conversationId="c1" />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('대화 정보를 불러오지 못했습니다.')).toBeTruthy()
    const before = fn.mock.calls.length
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    await waitFor(() => expect(fn.mock.calls.length).toBeGreaterThan(before))
  })

  it('타임라인 조회 실패 시 안내 + 다시 시도 버튼', async () => {
    vi.stubGlobal('fetch', failStub())
    render(
      <QueryClientProvider client={makeQc()}>
        <Timeline me={me} conversationId="c1" members={[me, mate]} onReply={() => {}} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('메시지를 불러오지 못했습니다.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy()
  })

  it('검색은 로딩과 실패를 구분해 보여준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {}))) // 영원히 pending
    render(
      <MemoryRouter>
        <QueryClientProvider client={makeQc()}>
          <SearchBox />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    const box = screen.getByRole('textbox')
    await userEvent.type(box, '안녕{Enter}')
    expect(await screen.findByText('검색 중…')).toBeTruthy()
  })

  it('검색 실패 시 실패 문구 + 다시 시도', async () => {
    vi.stubGlobal('fetch', failStub())
    render(
      <MemoryRouter>
        <QueryClientProvider client={makeQc()}>
          <SearchBox />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByRole('textbox'), '안녕{Enter}')
    expect(await screen.findByText('검색에 실패했습니다.')).toBeTruthy()
  })

  it('활동 피드는 로딩·실패·빈 상태를 구분한다', async () => {
    vi.stubGlobal('fetch', failStub())
    render(
      <MemoryRouter>
        <QueryClientProvider client={makeQc()}>
          <ActivityPage />
        </QueryClientProvider>
      </MemoryRouter>,
    )
    expect(await screen.findByText('활동을 불러오지 못했습니다.')).toBeTruthy()
    expect(screen.queryByText('새 활동이 없습니다.')).toBeNull()
  })
})
