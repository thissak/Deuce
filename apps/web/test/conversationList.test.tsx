import type { ConversationSummary } from '@deuce/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { conversationsKey } from '../src/api/queries'
import { ConversationList } from '../src/components/ConversationList'

const me = { id: 'u1', email: 'me@example.com', name: '나', avatarUrl: null }

function conversation(over: Partial<ConversationSummary>): ConversationSummary {
  return {
    id: 'c1', type: 'CHANNEL', title: '공지', displayName: '공지', members: [me],
    lastMessage: null, unreadCount: 0, mutedAt: null, ...over,
  }
}

function renderList(items: ConversationSummary[], activeId?: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } },
  })
  qc.setQueryData(conversationsKey, items)
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetch)
  render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <ConversationList me={me} activeId={activeId} />
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return { qc, fetch }
}

afterEach(() => vi.unstubAllGlobals())

describe('대화 목록 분리와 메뉴', () => {
  it('대화·채널 필터로 목록을 나눈다', async () => {
    renderList([
      conversation({ id: 'dm', type: 'DM', title: null, displayName: '김철수' }),
      conversation({ id: 'group', type: 'GROUP', displayName: '프로젝트 대화' }),
      conversation({ id: 'channel', displayName: '공지 채널' }),
    ])

    await userEvent.click(screen.getByRole('button', { name: '채널' }))
    expect(screen.getByText('# 공지 채널')).toBeTruthy()
    expect(screen.queryByText('김철수')).toBeNull()
    expect(screen.queryByText('프로젝트 대화')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: '대화' }))
    expect(screen.getByText('김철수')).toBeTruthy()
    expect(screen.getByText('프로젝트 대화')).toBeTruthy()
    expect(screen.queryByText('# 공지 채널')).toBeNull()
  })

  it('우클릭 메뉴에서 채널을 음소거하고 캐시에 표시한다', async () => {
    const channel = conversation({ displayName: '공지 채널' })
    const { qc, fetch } = renderList([channel])

    fireEvent.contextMenu(screen.getByText('# 공지 채널').closest('button')!, { clientX: 80, clientY: 90 })
    await userEvent.click(screen.getByRole('menuitem', { name: '🔕 음소거' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/conversations/c1/mute',
      expect.objectContaining({ method: 'PUT' }),
    ))
    expect(qc.getQueryData<ConversationSummary[]>(conversationsKey)?.[0]?.mutedAt).not.toBeNull()
  })

  it('채널 나가기는 확인 후 요청하고 목록에서 제거한다', async () => {
    const channel = conversation({ displayName: '공지 채널' })
    const { qc, fetch } = renderList([channel], 'c1')

    fireEvent.contextMenu(screen.getByText('# 공지 채널').closest('button')!)
    await userEvent.click(screen.getByRole('menuitem', { name: '↪ 채널 나가기' }))
    expect(screen.getByRole('dialog', { name: '채널 나가기' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '채널 나가기' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/conversations/c1/members/me',
      expect.objectContaining({ method: 'DELETE' }),
    ))
    expect(qc.getQueryData<ConversationSummary[]>(conversationsKey)).toEqual([])
  })

  it('1:1 대화 메뉴에는 나가기를 표시하지 않는다', () => {
    renderList([conversation({ type: 'DM', title: null, displayName: '김철수' })])
    fireEvent.contextMenu(screen.getByText('김철수').closest('button')!)
    expect(screen.getByRole('menuitem', { name: '🔕 음소거' })).toBeTruthy()
    expect(screen.queryByText(/나가기/)).toBeNull()
  })
})
