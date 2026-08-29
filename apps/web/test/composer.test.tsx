import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '../src/components/Composer'
import { msg } from './cache.test'

const me = { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null }

function renderComposer(fetchImpl: typeof fetch) {
  vi.stubGlobal('fetch', fetchImpl)
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <Composer me={me} conversationId="c1" members={[me]} replyTo={null} onClearReply={() => {}} />
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('Composer', () => {
  it('Enter로 전송하고 입력을 비운다', async () => {
    const posted = msg({ id: 'new1', conversationId: 'c1' })
    const fn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(posted), { status: 201, headers: { 'content-type': 'application/json' } }),
    )
    renderComposer(fn as unknown as typeof fetch)
    const box = screen.getByRole('textbox')
    await userEvent.type(box, '안녕하세요{Enter}')
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(''))
    expect(fn).toHaveBeenCalledOnce()
    const body = JSON.parse((fn.mock.calls[0]?.[1] as RequestInit).body as string) as { body: string }
    expect(body.body).toBe('안녕하세요')
  })

  it('실패하면 입력을 보존하고 재시도 안내를 보여준다', async () => {
    const fn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    )
    renderComposer(fn as unknown as typeof fetch)
    const box = screen.getByRole('textbox')
    await userEvent.type(box, '실패할 메시지{Enter}')
    expect(await screen.findByText(/전송에 실패했습니다/)).toBeTruthy()
    expect((box as HTMLTextAreaElement).value).toBe('실패할 메시지')
  })

  it('Shift+Enter는 전송하지 않는다', async () => {
    const fn = vi.fn()
    renderComposer(fn as unknown as typeof fetch)
    await userEvent.type(screen.getByRole('textbox'), '줄1{Shift>}{Enter}{/Shift}줄2')
    expect(fn).not.toHaveBeenCalled()
  })

  // 한국어 IME: 조합 확정 Enter가 전송으로 새면 안 된다 (Composer의 isComposing 가드)
  it('IME 조합 중 Enter는 전송하지 않는다', async () => {
    const fn = vi.fn()
    renderComposer(fn as unknown as typeof fetch)
    const box = screen.getByRole('textbox')
    await userEvent.type(box, '안녕하세')
    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
    })
    expect(fn).not.toHaveBeenCalled()
    expect((box as HTMLTextAreaElement).value).toBe('안녕하세')
  })
})
