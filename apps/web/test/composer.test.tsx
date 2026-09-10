import type { MessageDto } from '@deuce/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { messagesKey } from '../src/api/queries'
import { Composer } from '../src/components/Composer'
import type { MessagesData } from '../src/realtime/cache'
import { msg } from './fixtures'

const me = { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null }
const mate = { id: 'u2', email: 'b@example.com', name: '김철수', avatarUrl: null }

function emptyCache(qc: QueryClient) {
  // 성공 콜백(appendMessage)이 실제로 돌았는지 캐시로 관측하기 위한 빈 페이지
  qc.setQueryData<MessagesData>(messagesKey('c1'), { pages: [{ items: [], nextCursor: null }], pageParams: [''] })
}

function cachedIds(qc: QueryClient): string[] {
  return qc.getQueryData<MessagesData>(messagesKey('c1'))?.pages[0]?.items.map((m) => m.id) ?? []
}

function renderComposer(fetchImpl: typeof fetch, members = [me], onClearReply = () => {}) {
  vi.stubGlobal('fetch', fetchImpl)
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  emptyCache(qc)
  render(
    <QueryClientProvider client={qc}>
      <Composer me={me} conversationId="c1" members={members} replyTo={null} onClearReply={onClearReply} />
    </QueryClientProvider>,
  )
  return qc
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

  it('실패하면 원문을 보관하고 재전송 안내를 보여준다', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(msg({ id: 'new1', conversationId: 'c1' })), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      )
    const qc = renderComposer(fn as unknown as typeof fetch)
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.type(box, '실패할 메시지{Enter}')
    expect(await screen.findByText(/전송에 실패했습니다/)).toBeTruthy()
    expect(screen.getByText('실패할 메시지')).toBeTruthy() // 원문은 안내 바에 그대로 남는다
    expect(box.value).toBe('')
    await userEvent.click(screen.getByRole('button', { name: '재전송' }))
    await waitFor(() => expect(cachedIds(qc)).toEqual(['new1'])) // 재전송 성공 콜백까지 완료
    expect(screen.queryByText(/전송에 실패했습니다/)).toBeNull()
    expect(fn).toHaveBeenCalledTimes(2)
    const body = JSON.parse((fn.mock.calls[1]?.[1] as RequestInit).body as string) as { body: string }
    expect(body.body).toBe('실패할 메시지')
  })

  it('응답을 기다리는 동안 이어 쓴 글은 전송 완료 후에도 남는다', async () => {
    let finish!: (r: Response) => void
    const fn = vi.fn().mockReturnValue(new Promise<Response>((r) => (finish = r)))
    const onClearReply = vi.fn()
    const qc = renderComposer(fn as unknown as typeof fetch, [me], onClearReply)
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.type(box, '첫 메시지{Enter}')
    expect(box.value).toBe('') // 전송 즉시 비운다
    expect(onClearReply).toHaveBeenCalledOnce() // 답장 칩도 제출 시점에 비운다
    await userEvent.type(box, '둘째')
    const posted = msg({ id: 'new1', conversationId: 'c1' })
    finish(new Response(JSON.stringify(posted), { status: 201, headers: { 'content-type': 'application/json' } }))
    await waitFor(() => expect(cachedIds(qc)).toEqual(['new1'])) // 성공 콜백이 끝난 뒤에 초안을 검사한다
    expect(box.value).toBe('둘째')
    const body = JSON.parse((fn.mock.calls[0]?.[1] as RequestInit).body as string) as { body: string }
    expect(body.body).toBe('첫 메시지')
  })

  it('실패 시 이어 쓴 초안은 덮지 않고, 실패분을 해소하기 전에는 새 전송을 받지 않는다', async () => {
    let fail!: (r: Response) => void
    const ok = () =>
      new Response(JSON.stringify(msg({ id: 'new2', conversationId: 'c1' })), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    const fn = vi
      .fn()
      .mockReturnValueOnce(new Promise<Response>((r) => (fail = r)))
      .mockImplementation(() => Promise.resolve(ok()))
    const qc = renderComposer(fn as unknown as typeof fetch)
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.type(box, '실패할 원문{Enter}')
    await userEvent.type(box, '새 초안')
    fail(new Response(JSON.stringify({ error: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } }))
    expect(await screen.findByText(/전송에 실패했습니다/)).toBeTruthy()
    expect(box.value).toBe('새 초안') // 새 초안은 덮지 않는다
    expect(screen.getByText('실패할 원문')).toBeTruthy()
    await userEvent.type(box, '{Enter}') // 미해결 실패가 있는 동안 새 전송은 받지 않는다 — payload는 하나뿐
    expect(fn).toHaveBeenCalledOnce()
    expect((screen.getByRole('button', { name: '보내기' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: '재전송' }))
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2))
    const body = JSON.parse((fn.mock.calls[1]?.[1] as RequestInit).body as string) as { body: string }
    expect(body.body).toBe('실패할 원문')
    await waitFor(() => expect(cachedIds(qc)).toEqual(['new2'])) // 재전송 성공 콜백까지 완료
    expect(screen.queryByText(/전송에 실패했습니다/)).toBeNull()
    expect(box.value).toBe('새 초안') // 재전송 성공은 새 초안을 건드리지 않는다
    await userEvent.type(box, '{Enter}') // 해소된 뒤에는 초안을 보낼 수 있다
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(3))
    expect((JSON.parse((fn.mock.calls[2]?.[1] as RequestInit).body as string) as { body: string }).body).toBe('새 초안')
  })

  it('버리기는 실패분만 지우고 새 초안을 그대로 둔다', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } }),
      )
    renderComposer(fn as unknown as typeof fetch)
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.type(box, '실패할 원문{Enter}')
    await screen.findByText(/전송에 실패했습니다/)
    await userEvent.type(box, '새 초안')
    await userEvent.click(screen.getByRole('button', { name: '버리기' }))
    expect(screen.queryByText(/전송에 실패했습니다/)).toBeNull()
    expect(screen.queryByText('실패할 원문')).toBeNull()
    expect(box.value).toBe('새 초안')
    expect((screen.getByRole('button', { name: '보내기' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('재전송은 처음 보낸 답장 대상과 멘션을 유지한다', async () => {
    let fail!: (r: Response) => void
    const fn = vi
      .fn()
      .mockReturnValueOnce(new Promise<Response>((r) => (fail = r)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(msg({ id: 'retry-ok', conversationId: 'c1' })), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fn)
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    emptyCache(qc)
    const onClearReply = vi.fn()
    // 재전송 시점에 멤버 목록이 바뀌어도(김철수 이탈) 제출 시 확정한 멘션 id를 그대로 보낸다
    const ui = (replyTo: MessageDto | null, members = [me, mate]) => (
      <QueryClientProvider client={qc}>
        <Composer me={me} conversationId="c1" members={members} replyTo={replyTo} onClearReply={onClearReply} />
      </QueryClientProvider>
    )
    const { rerender } = render(ui(msg({ id: 'quote-original' })))
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.type(box, '@김철수 원래 인용 답장{Enter}')
    expect(onClearReply).toHaveBeenCalledOnce() // 답장 칩은 제출 시점에 초안에서 떼어낸다
    rerender(ui(null, [me]))
    await userEvent.type(box, '새 초안')
    fail(new Response(JSON.stringify({ error: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } }))
    await screen.findByText(/전송에 실패했습니다/)
    rerender(ui(msg({ id: 'quote-new' }), [me])) // 새 초안에서 다른 답장을 고른다
    await userEvent.click(screen.getByRole('button', { name: '재전송' }))
    await waitFor(() => expect(cachedIds(qc)).toEqual(['retry-ok']))
    const bodies = fn.mock.calls.map(
      (c) => JSON.parse((c[1] as RequestInit).body as string) as { replyToId?: string; mentions: string[] },
    )
    expect(bodies[0]).toMatchObject({ replyToId: 'quote-original', mentions: ['u2'] })
    expect(bodies[1]).toEqual(bodies[0]) // 동일 payload 계약
    expect(box.value).toBe('새 초안') // 재전송 성공은 새 초안(답장 선택 포함)을 건드리지 않는다
    expect(onClearReply).toHaveBeenCalledOnce()
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
    await userEvent.click(screen.getByRole('option', { name: /김철수/ }))
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
    fireEvent.mouseDown(screen.getByRole('option', { name: /김철수/ }))
    await waitFor(() => {
      expect(box.value).toBe('안녕 @김철수  뒤에도')
      expect(box.selectionStart).toBe(8) // '안녕 @김철수 ' 바로 뒤 (start 3 + '@'1 + 이름3 + 공백1)
    })
  })

  it('@만 입력해도 Enter로 첫 후보를 선택하고 전송하지 않는다', async () => {
    const fn = vi.fn()
    renderComposer(fn as unknown as typeof fetch, [me, mate])
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.type(box, '@{Enter}')
    expect(box.value).toBe('@김철수 ')
    expect(fn).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('방향키로 후보를 순환하고 Enter로 선택한다', async () => {
    const fn = vi.fn()
    renderComposer(fn as unknown as typeof fetch, [me, mate, { ...mate, id: 'u3', name: '이영희' }])
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.type(box, '@{ArrowUp}')
    expect(screen.getByRole('option', { selected: true }).textContent).toContain('이영희')
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { selected: true }).textContent).toContain('김철수')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(box.value).toBe('@이영희 ')
    expect(document.activeElement).toBe(box)
    expect(fn).not.toHaveBeenCalled()
  })

  it('검색어 변경은 첫 후보로 돌아가고 Escape는 목록을 닫는다', async () => {
    const fn = vi.fn()
    renderComposer(fn as unknown as typeof fetch, [me, mate, { ...mate, id: 'u3', name: '이영희' }])
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.type(box, '@{ArrowDown}김')
    expect(screen.getByRole('option', { selected: true }).textContent).toContain('김철수')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(box.value).toBe('@김')
    expect(fn).not.toHaveBeenCalled()
  })

  it('한글 조합 중 Enter는 후보 선택이나 전송을 하지 않는다', async () => {
    const fn = vi.fn()
    renderComposer(fn as unknown as typeof fetch, [me, mate])
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.type(box, '@김')
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
    expect(box.value).toBe('@김')
    expect(screen.queryByRole('listbox')).not.toBeNull()
    expect(fn).not.toHaveBeenCalled()
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
