import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AgentInvite } from '../src/components/AgentInvite'
import { Composer } from '../src/components/Composer'
const me = { id: 'u1', name: '감독', email: 'a@example.com', avatarUrl: null }
const ai = { id: 'a1', userId: 'au1', name: '내 AI', ownerId: 'u1', ownerName: '감독', scope: 'SELECTED', conversationId: null,
  expiresAt: '2099-01-01', revoked: false, editable: true, isDefault: true, scopeAllows: true, excluded: true, participating: false, runtime: 'READY' }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete window.deuceDesktop })
function mount() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <AgentInvite conversationId="c1" /><Composer conversationId="c1" me={me} members={[me]} replyTo={null} onClearReply={() => {}} />
</QueryClientProvider>) }
it('기본 AI는 한 번 클릭으로 초대하고 작성하던 메시지와 첨부를 보존한다', async () => {
  let participating = false
  const fetch = vi.fn(async (_: unknown, init?: RequestInit) => {
    if (init?.method === 'PUT') { participating = true; return new Response('{}') }
    return new Response(JSON.stringify([{ ...ai, participating, excluded: !participating }]))
  }); vi.stubGlobal('fetch', fetch); mount()
  fireEvent.change(screen.getByPlaceholderText('메시지를 입력하세요'), { target: { value: '작성 중인 초안' } })
  fireEvent.change(screen.getByTestId('file-input'), { target: { files: [new File(['내용'], '자료.txt', { type: 'text/plain' })] } })
  await waitFor(() => expect((screen.getByRole('button', { name: 'AI 초대' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'AI 초대' }))
  await screen.findByRole('button', { name: '내 AI 참여 중' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(fetch.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(1)
  expect((screen.getByPlaceholderText('메시지를 입력하세요') as HTMLTextAreaElement).value).toBe('작성 중인 초안')
  expect(screen.getByRole('button', { name: '첨부 제거' })).toBeTruthy()
})
it('처음 연결할 때 PC 연결 성공 후 원래 대화에 자동 초대한다', async () => {
  let registered = false, participating = false
  const fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') { registered = true; return new Response(JSON.stringify({ id: 'a1', token: 'private-key', expiresAt: '2099-01-01' })) }
    if (init?.method === 'PUT') { participating = true; return new Response('{}') }
    return new Response(JSON.stringify(registered ? [{ ...ai, participating, excluded: !participating }] : []))
  }); vi.stubGlobal('fetch', fetch)
  const connectAgent = vi.fn(async () => ({ ok: true, persisted: true }))
  window.deuceDesktop = { focus: () => {}, connectAgent }; mount()
  await waitFor(() => expect((screen.getByRole('button', { name: 'AI 초대' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'AI 초대' }))
  fireEvent.click(await screen.findByRole('button', { name: '에이전트 등록' }))
  fireEvent.click(await screen.findByRole('button', { name: '이 PC에서 연결' }))
  await screen.findByRole('button', { name: '내 AI 참여 중' })
  expect(connectAgent).toHaveBeenCalledWith({ agentId: 'a1', token: 'private-key', provider: 'codex' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.body.textContent).not.toContain('private-key')
})
it('초대 실패 시 초안을 보존하며 다른 사람의 오프라인 AI 요청을 막는다', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_: unknown, init?: RequestInit) => init?.method === 'PUT'
    ? new Response('{}', { status: 503 })
    : new Response(JSON.stringify([ai, { ...ai, id: 'peer-ai', ownerName: '동료', editable: false, isDefault: false, participating: true, runtime: 'OFFLINE' }]))))
  mount(); fireEvent.change(screen.getByPlaceholderText('메시지를 입력하세요'), { target: { value: '남길 초안' } })
  await waitFor(() => expect((screen.getByRole('button', { name: 'AI 초대' }) as HTMLButtonElement).disabled).toBe(false))
  fireEvent.click(screen.getByRole('button', { name: 'AI 초대' })); await screen.findByText(/초대하지 못했습니다/)
  expect((screen.getByPlaceholderText('메시지를 입력하세요') as HTMLTextAreaElement).value).toBe('남길 초안')
  fireEvent.click(screen.getByRole('button', { name: 'AI에게 요청' })); fireEvent.click(screen.getByRole('button', { name: '지금까지 요약' }))
  expect((screen.getByRole('button', { name: '요청 보내기' }) as HTMLButtonElement).disabled).toBe(true)
  expect(screen.getByText(/AI가 연결된 PC에서/)).toBeTruthy()
})
it.each(['다시 시도', '요청 보내기'])('응답 유실 뒤 %s 한 번은 같은 요청 ID만 재전송한다', async button => {
  const submitted: { id: string; prompt: string }[] = []
  let receipt: unknown
  vi.stubGlobal('fetch', vi.fn(async (url: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body as string); submitted.push(body)
      receipt = { id: body.id, agentId: ai.id, conversationId: 'c1', status: 'COMPLETED', errorCode: null, resultMessageId: 'answer' }
      if (submitted.length === 1) throw new TypeError('Response lost after server acceptance')
      return new Response(JSON.stringify(receipt))
    }
    if (String(url).includes('/agent-requests/')) return new Response(JSON.stringify(receipt))
    return new Response(JSON.stringify([{ ...ai, participating: true, excluded: false }]))
  }))
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'AI에게 요청' }))
  fireEvent.click(screen.getByRole('button', { name: '지금까지 요약' }))
  fireEvent.click(screen.getByRole('button', { name: '요청 보내기' }))
  await screen.findByText(/요청 결과를 확인하지 못했습니다/)
  fireEvent.click(screen.getByRole('button', { name: button }))
  await screen.findByText('AI가 대화에 답했습니다.')
  expect(submitted).toHaveLength(2)
  expect(submitted[1]).toEqual(submitted[0])
})
it('응답 유실 후 질문을 바꾸면 새로운 요청 ID를 사용한다', async () => {
  const submitted: { id: string; prompt: string }[] = []
  vi.stubGlobal('fetch', vi.fn(async (_: unknown, init?: RequestInit) => {
    if (init?.method === 'POST') { submitted.push(JSON.parse(init.body as string)); throw new TypeError('Response lost') }
    return new Response(JSON.stringify([{ ...ai, participating: true, excluded: false }]))
  }))
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'AI에게 요청' }))
  fireEvent.click(screen.getByRole('button', { name: '지금까지 요약' }))
  fireEvent.click(screen.getByRole('button', { name: '요청 보내기' }))
  await screen.findByText(/요청 결과를 확인하지 못했습니다/)
  fireEvent.change(screen.getByLabelText('요청 내용'), { target: { value: '다른 질문입니다.' } })
  fireEvent.click(screen.getByRole('button', { name: '요청 보내기' }))
  await waitFor(() => expect(submitted).toHaveLength(2))
  expect(submitted[1]!.id).not.toBe(submitted[0]!.id)
  expect(submitted[1]!.prompt).toBe('다른 질문입니다.')
})
