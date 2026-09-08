import type { MessageDto, SharedFile } from '@deuce/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { messagesKey, sharedKey } from '../src/api/queries'
import { Composer } from '../src/components/Composer'
import { MessageBubble } from '../src/components/MessageBubble'
import { SharedTab } from '../src/components/SharedTab'
import type { MessagesData } from '../src/realtime/cache'
import { msg } from './fixtures'

const me = { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null }

function renderComposer(
  fetchImpl: unknown,
  opts: { replyTo?: MessageDto | null; onClearReply?: () => void } = {},
) {
  vi.stubGlobal('fetch', fetchImpl)
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  // 성공 콜백(appendMessage)이 실제로 돌았는지 캐시로 관측하기 위한 빈 페이지
  qc.setQueryData<MessagesData>(messagesKey('c1'), { pages: [{ items: [], nextCursor: null }], pageParams: [''] })
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

function cachedIds(qc: QueryClient): string[] {
  return qc.getQueryData<MessagesData>(messagesKey('c1'))?.pages[0]?.items.map((m) => m.id) ?? []
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

  it('업로드 응답을 기다리는 동안 이어 쓴 초안은 성공 후에도 남는다', async () => {
    let finish!: (r: Response) => void
    const fn = vi.fn().mockReturnValue(new Promise<Response>((r) => (finish = r)))
    const qc = renderComposer(fn)
    await userEvent.upload(screen.getByTestId('file-input'), new File(['hello'], 'a.txt', { type: 'text/plain' }))
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.type(box, '캡션')
    await userEvent.click(screen.getByText('보내기'))
    await waitFor(() => expect(fn).toHaveBeenCalledOnce())
    expect(box.value).toBe('') // 전송 즉시 비운다
    expect(screen.queryByText(/a\.txt/)).toBeNull() // 파일 칩도 제출 시점에 비운다
    await userEvent.type(box, '업로드 도중 쓴 초안')
    finish(new Response(JSON.stringify(msg({ id: 'up3' })), { status: 201, headers: { 'content-type': 'application/json' } }))
    await waitFor(() => expect(cachedIds(qc)).toEqual(['up3'])) // 성공 콜백이 끝난 뒤에 초안을 검사한다
    expect(box.value).toBe('업로드 도중 쓴 초안')
    expect((fn.mock.calls[0]![1] as RequestInit & { body: FormData }).body.get('body')).toBe('캡션')
  })

  it('업로드가 실패하면 파일과 캡션을 보관하고 그대로 재전송한다', async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(msg({ id: 'up4' })), { status: 201, headers: { 'content-type': 'application/json' } }),
      )
    renderComposer(fn)
    const box = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.upload(screen.getByTestId('file-input'), new File(['hello'], 'a.txt', { type: 'text/plain' }))
    await userEvent.type(box, '캡션')
    await userEvent.click(screen.getByText('보내기'))
    expect(await screen.findByText(/전송에 실패했습니다/)).toBeTruthy()
    expect(screen.getByText(/a\.txt/)).toBeTruthy() // 안내 바에 파일명
    expect(screen.getByRole('alert').textContent).toContain('캡션')
    expect(box.value).toBe('')
    await userEvent.click(screen.getByRole('button', { name: '재전송' }))
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(2))
    const fd = (fn.mock.calls[1]![1] as RequestInit).body as FormData
    expect((fd.get('file') as File).name).toBe('a.txt')
    expect(fd.get('body')).toBe('캡션')
    await waitFor(() => expect(screen.queryByText(/전송에 실패했습니다/)).toBeNull())
  })

  it('실패한 첨부를 재전송해 성공해도 새 초안의 파일은 남는다', async () => {
    let finish!: (r: Response) => void
    const fn = vi
      .fn()
      .mockReturnValueOnce(new Promise<Response>((r) => (finish = r)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(msg({ id: 'up5' })), { status: 201, headers: { 'content-type': 'application/json' } }),
      )
    const qc = renderComposer(fn)
    const input = screen.getByTestId('file-input')
    await userEvent.upload(input, new File(['a'], 'failed-a.txt', { type: 'text/plain' }))
    await userEvent.type(screen.getByRole('textbox'), '캡션 A')
    await userEvent.click(screen.getByText('보내기'))
    await waitFor(() => expect(fn).toHaveBeenCalledOnce())
    finish(new Response(JSON.stringify({ error: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } }))
    await screen.findByText(/전송에 실패했습니다/)
    await userEvent.upload(input, new File(['b'], 'draft-b.txt', { type: 'text/plain' }))
    expect(screen.getByText(/draft-b\.txt/)).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: '재전송' }))
    await waitFor(() => expect(cachedIds(qc)).toEqual(['up5'])) // 재전송 성공 콜백까지 완료
    expect(screen.queryByText(/전송에 실패했습니다/)).toBeNull()
    expect(screen.getByText(/draft-b\.txt/)).toBeTruthy() // 성공 정리는 초안을 건드리지 않는다
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
    await userEvent.click(screen.getByRole('button', { name: '첨부 제거' }))
    expect(screen.queryByText(/a\.txt/)).toBeNull()
    expect((screen.getByText('보내기') as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('첨부 이미지 미리보기', () => {
  // jsdom은 URL.createObjectURL을 구현하지 않으므로 스텁한다
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview1')
    URL.revokeObjectURL = vi.fn()
  })

  it('이미지 파일을 고르면 미리보기 썸네일을 보여준다', async () => {
    renderComposer(vi.fn())
    await userEvent.upload(screen.getByTestId('file-input'), new File(['x'], 'shot.png', { type: 'image/png' }))
    const img = screen.getByRole('img', { name: 'shot.png' })
    expect(img.getAttribute('src')).toBe('blob:preview1')
  })

  it('이미지가 아닌 파일에는 미리보기를 보여주지 않는다', async () => {
    renderComposer(vi.fn())
    await userEvent.upload(screen.getByTestId('file-input'), new File(['hello'], 'a.txt', { type: 'text/plain' }))
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('파일을 교체하면 이전 미리보기 URL을 해제한다', async () => {
    let count = 0
    URL.createObjectURL = vi.fn(() => `blob:preview${++count}`)
    renderComposer(vi.fn())
    const input = screen.getByTestId('file-input') as HTMLInputElement
    await userEvent.upload(input, new File(['x'], 'a.png', { type: 'image/png' }))
    await userEvent.upload(input, new File(['y'], 'b.png', { type: 'image/png' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview1')
    expect(screen.getByRole('img', { name: 'b.png' }).getAttribute('src')).toBe('blob:preview2')
  })

  it('칩의 ✕로 파일을 빼면 미리보기 URL을 해제한다', async () => {
    renderComposer(vi.fn())
    await userEvent.upload(screen.getByTestId('file-input'), new File(['x'], 'a.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('button', { name: '첨부 제거' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview1')
  })

  it('언마운트 시 미리보기 URL을 해제한다', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <Composer me={me} conversationId="c1" members={[me]} replyTo={null} onClearReply={() => {}} />
      </QueryClientProvider>,
    )
    await userEvent.upload(screen.getByTestId('file-input'), new File(['x'], 'a.png', { type: 'image/png' }))
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview1')
  })
})

describe('드래그앤드롭 첨부', () => {
  it('컴포저에 파일을 드롭하면 첨부된다', async () => {
    renderComposer(vi.fn())
    const composer = screen.getByTestId('composer')
    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    fireEvent.drop(composer, { dataTransfer: { files: [file], types: ['Files'] } })
    expect(await screen.findByText(/photo\.png/)).toBeTruthy()
  })

  it('25MB 초과 파일을 드롭하면 기존 용량 오류를 보여주고 첨부하지 않는다', async () => {
    renderComposer(vi.fn())
    const composer = screen.getByTestId('composer')
    const big = new File([''], 'big.bin')
    Object.defineProperty(big, 'size', { value: 26214401 })
    fireEvent.drop(composer, { dataTransfer: { files: [big], types: ['Files'] } })
    expect(await screen.findByText(/최대 25MB/)).toBeTruthy()
    expect(screen.queryByText(/big\.bin/)).toBeNull()
  })

  it('드래그오버 중에는 어포던스를 보여주고, 벗어나면 사라진다', () => {
    renderComposer(vi.fn())
    const composer = screen.getByTestId('composer')
    fireEvent.dragEnter(composer, { dataTransfer: { types: ['Files'] } })
    expect(composer.className).toContain('dragging')
    fireEvent.dragLeave(composer, { dataTransfer: { types: ['Files'] } })
    expect(composer.className).not.toContain('dragging')
  })

  it('자식 엘리먼트로 이동하는 dragleave는 어포던스를 유지한다', () => {
    renderComposer(vi.fn())
    const composer = screen.getByTestId('composer')
    const child = screen.getByRole('textbox')
    fireEvent.dragEnter(composer, { dataTransfer: { types: ['Files'] } })
    fireEvent.dragEnter(child, { dataTransfer: { types: ['Files'] } })
    fireEvent.dragLeave(child, { dataTransfer: { types: ['Files'] } })
    expect(composer.className).toContain('dragging')
  })

  it('텍스트 드래그는 어포던스를 켜지 않는다', () => {
    renderComposer(vi.fn())
    const composer = screen.getByTestId('composer')
    fireEvent.dragEnter(composer, { dataTransfer: { types: ['text/plain'] } })
    expect(composer.className).not.toContain('dragging')
  })

  it('여러 파일을 드롭하면 첫 번째만 첨부하고 안내를 보여준다', async () => {
    renderComposer(vi.fn())
    const composer = screen.getByTestId('composer')
    const a = new File(['x'], 'a.png', { type: 'image/png' })
    const b = new File(['y'], 'b.png', { type: 'image/png' })
    fireEvent.drop(composer, { dataTransfer: { files: [a, b], types: ['Files'] } })
    expect(await screen.findByText(/a\.png/)).toBeTruthy()
    expect(screen.queryByText(/b\.png/)).toBeNull()
    expect(screen.getByText('여러 파일 중 첫 번째만 첨부됩니다.')).toBeTruthy()
  })

  it('여러 파일 중 첫 번째가 크기를 넘으면 첨부 안내 대신 크기 오류만 보여준다', async () => {
    renderComposer(vi.fn())
    const composer = screen.getByTestId('composer')
    const big = new File([new Uint8Array(26214401)], 'big.png', { type: 'image/png' })
    const small = new File(['y'], 'b.png', { type: 'image/png' })
    fireEvent.drop(composer, { dataTransfer: { files: [big, small], types: ['Files'] } })
    expect(await screen.findByText(/파일이 너무 큽니다/)).toBeTruthy()
    expect(screen.queryByText(/big\.png/)).toBeNull() // 첨부된 게 없다
    expect(screen.queryByText('여러 파일 중 첫 번째만 첨부됩니다.')).toBeNull()
  })

  it('업로드 중에도 드롭으로 다음 초안의 파일을 고를 수 있고 완료가 그 파일을 지우지 않는다', async () => {
    let resolveFetch!: (v: Response) => void
    const fn = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve }))
    const qc = renderComposer(fn)
    const composer = screen.getByTestId('composer')
    await userEvent.upload(screen.getByTestId('file-input'), new File(['hello'], 'a.txt'))
    await userEvent.click(screen.getByText('보내기'))
    await waitFor(() => expect(fn).toHaveBeenCalledOnce())
    expect(screen.queryByText(/a\.txt/)).toBeNull() // 제출 시점에 초안에서 떼어냈다
    const other = new File(['y'], 'other.png', { type: 'image/png' })
    fireEvent.drop(composer, { dataTransfer: { files: [other], types: ['Files'] } })
    expect(screen.getByText(/other\.png/)).toBeTruthy()
    resolveFetch(new Response(JSON.stringify(msg({ id: 'up9' })), { status: 201, headers: { 'content-type': 'application/json' } }))
    await waitFor(() => expect(cachedIds(qc)).toEqual(['up9'])) // 성공 콜백이 끝난 뒤에 초안을 검사한다
    expect(screen.getByText(/other\.png/)).toBeTruthy()
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

  it('이미지 첨부는 인라인 썸네일로 보여준다', () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <MessageBubble
          m={msg({ attachments: [{ id: 'a1', fileName: 'shot.png', size: 2048, contentType: 'image/png' }] })}
          isMine
          meId="u1"
          memberNames={[]}
          onReply={() => {}}
        />
      </QueryClientProvider>,
    )
    const img = screen.getByRole('img', { name: 'shot.png' })
    expect(img.getAttribute('src')).toBe('/api/attachments/a1')
    const link = screen.getByRole('link', { name: /shot\.png/ })
    expect(link.getAttribute('href')).toBe('/api/attachments/a1')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('이미지 로드 실패 시 파일 카드로 대체한다', () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <MessageBubble
          m={msg({ attachments: [{ id: 'a1', fileName: 'shot.png', size: 2048, contentType: 'image/png' }] })}
          isMine
          meId="u1"
          memberNames={[]}
          onReply={() => {}}
        />
      </QueryClientProvider>,
    )
    fireEvent.error(screen.getByRole('img', { name: 'shot.png' }))
    expect(screen.queryByRole('img')).toBeNull()
    const link = screen.getByRole('link', { name: /shot\.png/ })
    expect(link.getAttribute('href')).toBe('/api/attachments/a1')
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
