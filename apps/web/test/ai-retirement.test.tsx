import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { conversationKey, messagesKey } from '../src/api/queries'
import { ChatView } from '../src/components/ChatView'
import { Shell } from '../src/components/Shell'
import { msg } from './fixtures'

afterEach(() => vi.unstubAllGlobals())

it('shows historical AI replies but offers only people as mention targets and makes no AI queries', async () => {
  const me = { id: 'me', name: '감독', email: 'me@example.com', avatarUrl: null }
  const peer = { ...me, id: 'peer', name: '동료' }
  const bot = { ...me, id: 'bot', name: '이전 봇', isAgent: true }
  const fetch = vi.fn().mockResolvedValue(new Response('{}'))
  vi.stubGlobal('fetch', fetch)
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(conversationKey('c1'), {
    id: 'c1', type: 'CHANNEL', title: '채팅', displayName: '채팅', members: [me, peer, bot],
    lastMessage: null, unreadCount: 0, mutedAt: null, pinnedMessage: null,
  })
  qc.setQueryData(messagesKey('c1'), { pages: [{ items: [msg({ author: bot, body: '보존할 과거 답변' })], nextCursor: null }], pageParams: [''] })
  render(<QueryClientProvider client={qc}><MemoryRouter><ChatView me={me} conversationId="c1" /></MemoryRouter></QueryClientProvider>)
  expect(screen.getByText('보존할 과거 답변')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /AI 초대|AI에게 요청|AI 관리/ })).toBeNull()
  await userEvent.type(screen.getByRole('textbox'), '@')
  expect(screen.getByRole('option', { name: /동료/ })).toBeTruthy()
  expect(screen.queryByRole('option', { name: /이전 봇/ })).toBeNull()
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/agents'))).toBe(false)
  qc.clear()
})

it('removes the app entry point for personal AI settings', () => {
  const qc = new QueryClient()
  render(<QueryClientProvider client={qc}><MemoryRouter initialEntries={['/activity']}><Shell me={{ id: 'me', name: '감독', email: 'me@example.com', avatarUrl: null }} /></MemoryRouter></QueryClientProvider>)
  expect(screen.queryByRole('button', { name: '설정' })).toBeNull()
  qc.clear()
})
