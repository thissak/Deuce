import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NewChatDialog } from '../src/components/NewChatDialog'
import { AgentSettings } from '../src/components/AgentSettings'

const me = { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function mount(ui: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)
}
it('혼자 채널을 만들고 이후에 사람과 AI를 추가할 수 있다', async () => {
  const fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === 'POST'
    ? { id: 'c1', type: 'CHANNEL', title: '요구사항', displayName: '요구사항', members: [me], lastMessage: null, unreadCount: 0, mutedAt: null } : [me])))
  vi.stubGlobal('fetch', fetch)
  const close = vi.fn(); mount(<NewChatDialog me={me} onClose={close} />)
  fireEvent.click(screen.getByRole('checkbox', { name: '채널로 만들기' }))
  fireEvent.change(screen.getByPlaceholderText('그룹 이름 (두 명 이상이면 필수)'), { target: { value: '요구사항' } })
  fireEvent.click(screen.getByRole('button', { name: '시작' }))
  await waitFor(() => expect(close).toHaveBeenCalledWith('c1'))
  expect(fetch.mock.calls.find(([, init]) => init?.method === 'POST')![1].body).toBe(JSON.stringify({ type: 'channel', title: '요구사항', memberIds: [] }))
})
it('키 발급 후 중복 발급을 막고 해제하면 저장 버튼과 키 상태를 없앤다', async () => {
  const fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return new Response(JSON.stringify({ id: 'a1', token: 'SECRET_TOKEN', expiresAt: '2027-01-01' }))
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    return new Response(JSON.stringify([{ id: 'a1', name: '내 AI', ownerName: 'A', expiresAt: '2027-01-01', revoked: false }]))
  })
  vi.stubGlobal('fetch', fetch)
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  mount(<AgentSettings conversationId="c1" onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '연결 키 만들기' }))
  await screen.findByRole('button', { name: 'AI 연결 파일 저장' })
  expect((screen.getByRole('button', { name: '연결 키 만들기' }) as HTMLButtonElement).disabled).toBe(true)
  expect(document.body.textContent).not.toContain('SECRET_TOKEN')
  fireEvent.click(screen.getByRole('button', { name: 'Codex 설정 복사' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('http_headers = { Authorization = "Bearer SECRET_TOKEN" }')))
  expect(writeText.mock.calls[0]![0]).toContain(`${location.origin}/mcp`)
  expect(writeText.mock.calls[0]![0]).not.toContain('command =')
  fireEvent.click(screen.getByRole('button', { name: 'Claude Code 등록 명령 복사' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('claude mcp add-json --scope user deuce-a1')))
  expect(writeText.mock.calls[1]![0]).toContain('"type":"http"')
  writeText.mockRejectedValueOnce(new Error('clipboard unavailable'))
  fireEvent.click(screen.getByRole('button', { name: '주소 복사' }))
  await screen.findByRole('alert')
  fireEvent.click(await screen.findByRole('button', { name: '연결 해제' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'AI 연결 파일 저장' })).toBeNull())
  expect(screen.queryByRole('button', { name: 'Codex 설정 복사' })).toBeNull()
})
