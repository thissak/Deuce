import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '../src/components/Composer'
import { msg } from './fixtures'

const me = { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null }
const mate = { id: 'u2', email: 'b@example.com', name: '김철수', avatarUrl: null }

function renderComposer(fetchImpl: typeof fetch, members = [me]) {
  vi.stubGlobal('fetch', fetchImpl)
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <Composer me={me} conversationId="c1" members={members} replyTo={null} onClearReply={() => {}} />
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
    // 전송이 샜다면 mutationFn 마이크로태스크가 여기서 실행된다 — 뒤따르는 타이핑에 기대지 않는다
    await act(async () => {})
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

describe('Composer 멘션', () => {
  it('@ 뒤 입력에 맞는 후보를 보여주고 고르면 이름을 채운다', async () => {
    const fn = vi.fn()
    renderComposer(fn as unknown as typeof fetch, [me, mate])
    const box = screen.getByRole('textbox')
    await userEvent.type(box, '@김')
    await userEvent.click(screen.getByRole('button', { name: /김철수/ }))
    expect((box as HTMLTextAreaElement).value).toBe('@김철수 ')
    expect(fn).not.toHaveBeenCalled()
  })

  it('팝업이 열려 있으면 Enter는 전송 대신 첫 후보를 고른다', async () => {
    const fn = vi.fn()
    renderComposer(fn as unknown as typeof fetch, [me, mate])
    const box = screen.getByRole('textbox')
    await userEvent.type(box, '@김{Enter}')
    await act(async () => {})
    expect(fn).not.toHaveBeenCalled()
    expect((box as HTMLTextAreaElement).value).toBe('@김철수 ')
  })

  it('전송할 때 본문에 남은 멘션의 id를 함께 보낸다', async () => {
    const fn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(msg({ id: 'new1', conversationId: 'c1' })), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )
    renderComposer(fn as unknown as typeof fetch, [me, mate])
    const box = screen.getByRole('textbox')
    await userEvent.type(box, '@김{Enter}확인 부탁드립니다{Enter}')
    await waitFor(() => expect(fn).toHaveBeenCalledOnce())
    const body = JSON.parse((fn.mock.calls[0]?.[1] as RequestInit).body as string) as {
      body: string
      mentions: string[]
    }
    expect(body.body).toBe('@김철수 확인 부탁드립니다')
    expect(body.mentions).toEqual(['u2'])
  })

  it('멘션 삽입 후 캐럿이 멘션 바로 뒤에 놓인다', async () => {
    const fn = vi.fn()
    renderComposer(fn as unknown as typeof fetch, [me, mate])
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '안녕 @ 뒤에도' } })
    box.setSelectionRange(4, 4)
    fireEvent.click(box) // refreshMention이 캐럿 위치를 읽는다
    fireEvent.mouseDown(screen.getByRole('button', { name: /김철수/ }))
    await waitFor(() => {
      expect(box.value).toBe('안녕 @김철수  뒤에도')
      expect(box.selectionStart).toBe(8) // '안녕 @김철수 ' 바로 뒤 (start 3 + '@'1 + 이름3 + 공백1)
    })
  })

  it("'@'만 입력한 Enter는 멘션 선택이 아니라 전송이다", async () => {
    const posted = msg({ id: 'new1', conversationId: 'c1', body: '@' })
    const fn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(posted), { status: 201, headers: { 'content-type': 'application/json' } }),
    )
    renderComposer(fn as unknown as typeof fetch, [me, mate])
    await userEvent.type(screen.getByRole('textbox'), '@{Enter}')
    await waitFor(() => expect(fn).toHaveBeenCalledOnce())
  })

  it('본문 앞뒤 공백을 잘라 보낸다', async () => {
    const posted = msg({ id: 'new1', conversationId: 'c1' })
    const fn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(posted), { status: 201, headers: { 'content-type': 'application/json' } }),
    )
    renderComposer(fn as unknown as typeof fetch)
    await userEvent.type(screen.getByRole('textbox'), ' 안녕 {Enter}')
    await waitFor(() => expect(fn).toHaveBeenCalledOnce())
    const body = JSON.parse((fn.mock.calls[0]?.[1] as RequestInit).body as string) as { body: string }
    expect(body.body).toBe('안녕')
  })
})
