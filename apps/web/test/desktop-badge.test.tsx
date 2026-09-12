import { EventEmitter } from 'node:events'
import type { ConversationSummary } from '@deuce/shared'
import { RT } from '@deuce/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DesktopBadge } from '../src/components/DesktopBadge'
import { attachRealtime } from '../src/realtime/wiring'
import type { AppSocket } from '../src/realtime/socket'
import { msg } from './fixtures'

afterEach(() => { delete window.deuceDesktop; vi.unstubAllGlobals(); vi.restoreAllMocks() })

const conversation = (id: string, unreadCount: number): ConversationSummary => ({
  id, unreadCount, type: 'GROUP', title: id, displayName: id, members: [], lastMessage: null, mutedAt: null,
})

it('백그라운드에서도 서버 합계를 표시하고 중복 수신·읽음·삭제·탈퇴·재접속을 반영한다', async () => {
  const setUnreadCount = vi.fn()
  window.deuceDesktop = { focus: vi.fn(), setUnreadCount }
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  let conversations = [conversation('c1', 2), { ...conversation('c2', 3), mutedAt: '2026-09-10T00:00:00Z' }]
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(conversations))))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const socket = new EventEmitter()
  const detach = attachRealtime(socket as unknown as AppSocket, qc, 'u1')
  const view = render(<QueryClientProvider client={qc}><DesktopBadge signedIn /></QueryClientProvider>)
  await waitFor(() => expect(setUnreadCount).toHaveBeenLastCalledWith(5))
  conversations = [conversation('c1', 3), conversation('c2', 3)]
  await act(async () => { socket.emit(RT.messageNew, msg({})); socket.emit(RT.messageNew, msg({})) })
  await waitFor(() => expect(setUnreadCount).toHaveBeenLastCalledWith(6))
  conversations = [conversation('c1', 0), conversation('c2', 3)]
  await act(async () => { socket.emit(RT.readAdvanced, { conversationId: 'c1', userId: 'u1', lastReadMessageId: 'm1' }) })
  await waitFor(() => expect(setUnreadCount).toHaveBeenLastCalledWith(3))
  conversations = [conversation('c1', 0), conversation('c2', 2)]
  await act(async () => { socket.emit(RT.messageDeleted, msg({ conversationId: 'c2', deleted: true })) })
  await waitFor(() => expect(setUnreadCount).toHaveBeenLastCalledWith(2))
  conversations = [conversation('c1', 0)]
  await act(async () => { socket.emit(RT.conversationRemoved, { conversationId: 'c2' }) })
  await waitFor(() => expect(setUnreadCount).toHaveBeenLastCalledWith(0))
  conversations = [conversation('c1', 7)]
  await act(async () => { socket.emit('connect') })
  await waitFor(() => expect(setUnreadCount).toHaveBeenLastCalledWith(7))
  view.rerender(<QueryClientProvider client={qc}><DesktopBadge signedIn={false} /></QueryClientProvider>)
  await waitFor(() => expect(setUnreadCount).toHaveBeenLastCalledWith(0))
  view.unmount()
  detach()
  qc.clear()
})

it('웹·구버전 앱·미로그인에서는 배지를 위한 조회를 시작하지 않는다', () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const qc = new QueryClient()
  const view = render(<QueryClientProvider client={qc}><DesktopBadge signedIn /></QueryClientProvider>)
  window.deuceDesktop = { focus: vi.fn() }
  view.rerender(<QueryClientProvider client={qc}><DesktopBadge signedIn /></QueryClientProvider>)
  const setUnreadCount = vi.fn()
  window.deuceDesktop = { focus: vi.fn(), setUnreadCount }
  view.rerender(<QueryClientProvider client={qc}><DesktopBadge signedIn={false} /></QueryClientProvider>)
  expect(setUnreadCount).toHaveBeenLastCalledWith(0)
  expect(fetch).not.toHaveBeenCalled()
  view.unmount()
  qc.clear()
})
