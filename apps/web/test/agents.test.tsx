import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NewChatDialog } from '../src/components/NewChatDialog'
import { AgentSettings } from '../src/components/AgentSettings'
import { MyAgentsSettings } from '../src/components/MyAgentsSettings'

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

it('일반 대화에서 내 에이전트를 해제·재참여시키며 타인의 에이전트 조작 버튼은 없다', async () => {
  let excluded = false
  const fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') { excluded = JSON.parse(init.body as string).excluded; return new Response(JSON.stringify({ excluded })) }
    return new Response(JSON.stringify([
      { id: 'a1', name: '내 Codex', ownerId: 'u1', ownerName: 'A', scope: 'ALL', conversationId: null, expiresAt: '2099-01-01', revoked: false, editable: true, scopeAllows: true, participating: !excluded, excluded },
      { id: 'a2', name: '상대 AI', ownerId: 'u2', ownerName: 'B', scope: 'ALL', conversationId: null, expiresAt: '2099-01-01', revoked: false, editable: false, scopeAllows: true, participating: true, excluded: false },
    ]))
  })
  vi.stubGlobal('fetch', fetch)
  mount(<AgentSettings conversationId="dm1" onClose={() => {}} />)
  expect((await screen.findAllByRole('button', { name: '이 대화에서 해제' })).length).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: '이 대화에서 해제' }))
  fireEvent.click(await screen.findByRole('button', { name: '참여시키기' }))
  await screen.findByRole('button', { name: '이 대화에서 해제' })
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'PUT').map(([url, init]) => [url, JSON.parse(init.body)])).toEqual([
    ['/api/conversations/dm1/agents/a1', { excluded: true }], ['/api/conversations/dm1/agents/a1', { excluded: false }],
  ])
})

it('채널 전용 범위의 AI는 DM에서 설정 변경 안내를 제공하고 설정에 선택한 범위를 저장한다', async () => {
  let scope = 'CHANNELS'
  const fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') { scope = JSON.parse(init.body as string).scope; return new Response('{}') }
    return new Response(JSON.stringify([{ id: 'a1', name: '내 AI', ownerId: 'u1', ownerName: 'A', scope, conversationId: null, expiresAt: '2099-01-01', revoked: false, editable: true, participating: scope === 'ALL', scopeAllows: scope === 'ALL', excluded: false }]))
  })
  vi.stubGlobal('fetch', fetch)
  mount(<AgentSettings conversationId="dm1" onClose={() => {}} />)
  await screen.findByText(/채널만 참여하도록 설정되어 있습니다/)
  expect(screen.queryByRole('button', { name: '참여시키기' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '내 에이전트 설정' }))
  fireEvent.change(await screen.findByRole('combobox', { name: '내 AI 참여 범위' }), { target: { value: 'ALL' } })
  await waitFor(() => expect(fetch.mock.calls.some(([url, init]) => url === '/api/agents/a1' && init?.method === 'PATCH' && init.body === JSON.stringify({ scope: 'ALL' }))).toBe(true))
  fireEvent.click(screen.getByRole('button', { name: '닫기' }))
  await screen.findByRole('button', { name: '이 대화에서 해제' })
})
it('키 발급 후 중복 발급을 막고 해제하면 저장 버튼과 키 상태를 없앤다', async () => {
  const fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return new Response(JSON.stringify({ id: 'a1', token: 'SECRET_TOKEN', expiresAt: '2027-01-01' }))
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    return new Response(JSON.stringify([{ id: 'a1', name: '내 AI', ownerName: 'A', ownerId: 'u1', scope: 'CHANNELS', conversationId: null, editable: true, expiresAt: '2099-01-01', revoked: false }]))
  })
  vi.stubGlobal('fetch', fetch)
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  mount(<MyAgentsSettings onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '에이전트 등록' }))
  fireEvent.click(await screen.findByText('연결 파일 저장'))
  await screen.findByRole('button', { name: 'AI 연결 파일 저장' })
  expect((screen.getByRole('button', { name: '에이전트 등록' }) as HTMLButtonElement).disabled).toBe(true)
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
  fireEvent.click(await screen.findByRole('button', { name: '전체 연결 해제' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'AI 연결 파일 저장' })).toBeNull())
  expect(screen.queryByRole('button', { name: 'Codex 설정 복사' })).toBeNull()
})
