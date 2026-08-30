import type { MessageDto, SharedFile } from '@deuce/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sharedKey } from '../src/api/queries'
import { Composer } from '../src/components/Composer'
import { MessageBubble } from '../src/components/MessageBubble'
import { SharedTab } from '../src/components/SharedTab'
import { msg } from './fixtures'

const me = { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null }

function renderComposer(
  fetchImpl: unknown,
  opts: { replyTo?: MessageDto | null; onClearReply?: () => void } = {},
) {
  vi.stubGlobal('fetch', fetchImpl)
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <Composer
        me={me}
        conversationId="c1"
        members={[me]}
        replyTo={opts.replyTo ?? null}
        onClearReply={opts.onClearReply ?? (() => {})}
      />
    </QueryClientProvider>,
  )
  return qc
}

function created(over: Parameters<typeof msg>[0]) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(msg(over)), { status: 201, headers: { 'content-type': 'application/json' } }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('첨부 업로드', () => {
  it('파일 선택 후 보내면 FormData로 첨부 엔드포인트를 호출한다', async () => {
    const fn = created({ id: 'up1' })
    renderComposer(fn)
    const input = screen.getByTestId('file-input') as HTMLInputElement
    await userEvent.upload(input, new File(['hello'], 'a.txt', { type: 'text/plain' }))
    expect(screen.getByText(/a\.txt/)).toBeTruthy()
    await userEvent.type(screen.getByRole('textbox'), '  캡션입니다  ')
    await userEvent.click(screen.getByText('보내기'))
    await waitFor(() => expect(fn).toHaveBeenCalledOnce())
    const [url, init] = fn.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/conversations/c1/attachments')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('body')).toBe('캡션입니다') // 앞뒤 공백은 trim된다
    expect(((init.body as FormData).get('file') as File).name).toBe('a.txt')
  })

  it('25MB 초과 파일은 보내지 않고 안내한다', async () => {
    const fn = vi.fn()
    renderComposer(fn)
    const input = screen.getByTestId('file-input') as HTMLInputElement
    const big = new File([''], 'big.bin')
    Object.defineProperty(big, 'size', { value: 26214401 })
    await userEvent.upload(input, big)
    expect(await screen.findByText(/최대 25MB/)).toBeTruthy()
    expect(fn).not.toHaveBeenCalled()
  })

  it('파일이 있으면 캡션이 비어도 보내고, 성공하면 공유 목록을 무효화한다', async () => {
    const fn = created({ id: 'up2' })
    const qc = renderComposer(fn)
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await userEvent.upload(screen.getByTestId('file-input'), new File(['hello'], 'a.txt'))
    await userEvent.click(screen.getByText('보내기'))
    await waitFor(() => expect(fn).toHaveBeenCalledOnce())
    expect((fn.mock.calls[0]![1] as RequestInit & { body: FormData }).body.get('body')).toBe('')
    expect(spy).toHaveBeenCalledWith({ queryKey: sharedKey('c1') })
    await waitFor(() => expect(screen.queryByText(/a\.txt/)).toBeNull())
  })

  it('답장 상태에서 첨부를 보내면 답장을 해제한다', async () => {
    const fn = created({ id: 'up3' })
    const onClearReply = vi.fn()
    renderComposer(fn, { replyTo: msg({ id: 'r1' }), onClearReply })
    await userEvent.upload(screen.getByTestId('file-input'), new File(['hello'], 'a.txt'))
    await userEvent.click(screen.getByText('보내기'))
    await waitFor(() => expect(fn).toHaveBeenCalledOnce())
    await waitFor(() => expect(onClearReply).toHaveBeenCalled())
  })

  it('칩의 ✕로 고른 파일을 뺀다', async () => {
    const fn = vi.fn()
    renderComposer(fn)
    await userEvent.upload(screen.getByTestId('file-input'), new File(['hello'], 'a.txt'))
    await userEvent.click(screen.getByRole('button', { name: '✕' }))
    expect(screen.queryByText(/a\.txt/)).toBeNull()
    expect((screen.getByText('보내기') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('첨부 표시', () => {
  it('MessageBubble은 첨부를 다운로드 링크로 보여준다', () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <MessageBubble
          m={msg({ attachments: [{ id: 'a1', fileName: '보고서.pdf', size: 2048, contentType: 'application/pdf' }] })}
          isMine
          meId="u1"
          memberNames={[]}
          onReply={() => {}}
        />
      </QueryClientProvider>,
    )
    const link = screen.getByRole('link', { name: /보고서\.pdf/ })
    expect(link.getAttribute('href')).toBe('/api/attachments/a1')
    expect(link.textContent).toContain('2.0KB')
  })

  it('공유 탭은 파일 목록을 시각·크기와 함께 보여준다', async () => {
    const files: SharedFile[] = [
      {
        id: 'a1',
        fileName: '보고서.pdf',
        size: 2048,
        contentType: 'application/pdf',
        messageId: 'm1',
        createdAt: '2026-08-29T00:00:00.000Z',
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(files), { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SharedTab conversationId="c1" />
      </QueryClientProvider>,
    )
    const link = await screen.findByRole('link', { name: /보고서\.pdf/ })
    expect(link.getAttribute('href')).toBe('/api/attachments/a1')
    expect(link.textContent).toContain('2.0KB')
  })

  it('공유 파일이 없으면 빈 상태를 보여준다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }),
      ),
    )
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SharedTab conversationId="c1" />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('공유된 파일이 없습니다.')).toBeTruthy()
  })
})
