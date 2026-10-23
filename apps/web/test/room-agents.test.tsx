import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { RoomAgents } from '../src/components/RoomAgents'

afterEach(() => vi.unstubAllGlobals())

const token = `deuce_${'a'.repeat(43)}`
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function renderDialog(list: unknown[]) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return json({ id: 'k1', token, expiresAt: '2026-12-31T00:00:00.000Z' }, 201)
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    return json(list)
  })
  vi.stubGlobal('fetch', fetch)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={qc}><RoomAgents conversationId="c1" onClose={() => {}} /></QueryClientProvider>)
  return fetch
}

it('연결하면 키를 화면에 보이지 않고 Claude Code 등록 명령으로만 복사한다', async () => {
  const user = userEvent.setup()
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  const fetch = renderDialog([])
  expect(await screen.findByText('연결된 AI 세션이 없습니다.')).toBeTruthy()
  await user.type(screen.getByLabelText('AI 이름'), 'Lexus Claude')
  await user.click(screen.getByRole('button', { name: '연결' }))
  expect(fetch.mock.calls.some(([url, init]) => url === '/api/conversations/c1/agents' && init?.method === 'POST'
    && init.body === JSON.stringify({ name: 'Lexus Claude' }))).toBe(true)
  await user.click(await screen.findByRole('button', { name: 'Claude Code 등록 명령 복사' }))
  const command = writeText.mock.calls[0]?.[0] as string
  expect(command).toContain(`${location.origin}/mcp`)
  expect(command).toContain(`Authorization: Bearer ${token}`)
  expect(document.body.textContent).not.toContain(token)
})

it('연결 해제 버튼은 내가 연결한 AI에만 보인다', async () => {
  renderDialog([
    { id: 'a1', name: '내 Claude', ownerName: '감독', editable: true, lastConnectedAt: null, expiresAt: '2026-12-31T00:00:00.000Z' },
    { id: 'a2', name: '동료 Codex', ownerName: '동료', editable: false, lastConnectedAt: '2026-10-23T00:00:00.000Z', expiresAt: '2026-12-31T00:00:00.000Z' },
  ])
  expect(await screen.findByText(/동료님이 연결/)).toBeTruthy()
  expect(screen.getAllByRole('button', { name: '연결 해제' })).toHaveLength(1)
})

it('방금 연결한 AI를 해제하면 회수된 키의 설정 복사를 감추고 새 연결 입력창을 다시 보인다', async () => {
  const user = userEvent.setup()
  const list: unknown[] = []
  renderDialog(list)
  await user.type(await screen.findByLabelText('AI 이름'), 'Lexus Claude')
  list.push({ id: 'k1', name: 'Lexus Claude', ownerName: '감독', editable: true, lastConnectedAt: null, expiresAt: '2026-12-31T00:00:00.000Z' })
  await user.click(screen.getByRole('button', { name: '연결' }))
  expect(await screen.findByRole('button', { name: 'Claude Code 등록 명령 복사' })).toBeTruthy()
  await user.click(await screen.findByRole('button', { name: '연결 해제' }))
  expect(await screen.findByLabelText('AI 이름')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Claude Code 등록 명령 복사' })).toBeNull()
})
