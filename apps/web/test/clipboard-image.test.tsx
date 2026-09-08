import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Composer } from '../src/components/Composer'
import { msg } from './fixtures'

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('클립보드 이미지를 미리 보고 설명과 함께 전송한다', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(msg({ id: 'image-message' })), { status: 201 }))
  vi.stubGlobal('fetch', fetch)
  URL.createObjectURL = vi.fn().mockReturnValue('blob:clipboard-image')
  URL.revokeObjectURL = vi.fn()
  const me = { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null }
  render(<QueryClientProvider client={new QueryClient()}><Composer me={me} conversationId="c1" members={[me]} replyTo={null} onClearReply={() => {}} /></QueryClientProvider>)
  const image = new File(['image bytes'], 'screenshot.png', { type: 'image/png' })
  fireEvent.paste(screen.getByRole('textbox'), { clipboardData: { files: [image], items: [{ kind: 'file', type: image.type, getAsFile: () => image }] } })
  expect(await screen.findByRole('img', { name: 'screenshot.png' })).toBeTruthy()
  expect(fetch).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '화면 설명' } })
  fireEvent.click(screen.getByRole('button', { name: '보내기' }))
  await waitFor(() => expect(fetch).toHaveBeenCalledOnce())
  const [url, init] = fetch.mock.calls[0]!
  expect(url).toBe('/api/conversations/c1/attachments')
  expect((init.body as FormData).get('file')).toBe(image)
  expect((init.body as FormData).get('body')).toBe('화면 설명')
})

function mount(fetch: typeof globalThis.fetch) {
  vi.stubGlobal('fetch', fetch)
  URL.createObjectURL = vi.fn((f: File) => `blob:${f.name}`)
  URL.revokeObjectURL = vi.fn()
  const me = { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null }
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><Composer me={me} conversationId="c1" members={[me]} replyTo={null} onClearReply={() => {}} /></QueryClientProvider>)
}
const paste = (files: File[]) => fireEvent.paste(screen.getByRole('textbox'), { clipboardData: { files } })

it('이미지 제거·화면 종료에서 미리보기를 해제하고 일반 텍스트의 기본 붙여넣기를 유지한다', async () => {
  const fetch = vi.fn()
  const { unmount } = mount(fetch)
  const event = createEvent.paste(screen.getByRole('textbox'), { clipboardData: { files: [], getData: () => '일반 텍스트' } })
  fireEvent(screen.getByRole('textbox'), event)
  expect(event.defaultPrevented).toBe(false)
  paste([new File(['one'], 'one.png', { type: 'image/png' })])
  await screen.findByRole('img', { name: 'one.png' })
  fireEvent.click(screen.getByRole('button', { name: '첨부 제거' }))
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:one.png')
  expect(screen.queryByRole('img')).toBeNull()
  paste([new File(['two'], 'two.png', { type: 'image/png' })])
  await screen.findByRole('img', { name: 'two.png' })
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:two.png')
  expect(fetch).not.toHaveBeenCalled()
})

it('붙여넣은 이미지 업로드 실패 후 같은 파일을 재전송하고 새 이미지와 설명 초안을 유지한다', async () => {
  let finish!: (r: Response) => void
  const fetch = vi.fn().mockReturnValueOnce(new Promise<Response>((resolve) => { finish = resolve }))
    .mockResolvedValueOnce(new Response(JSON.stringify(msg({ id: 'retry-image' })), { status: 201 }))
  mount(fetch)
  const original = new File(['original'], 'original.png', { type: 'image/png' })
  paste([original])
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '원래 설명' } })
  fireEvent.click(screen.getByRole('button', { name: '보내기' }))
  await screen.findByRole('status')
  const draft = new File(['draft'], 'draft.png', { type: 'image/png' })
  paste([draft])
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '새 설명' } })
  finish(new Response(JSON.stringify({ error: 'failed' }), { status: 500 }))
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: '재전송' }))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  for (const [, init] of fetch.mock.calls) {
    expect((init.body as FormData).get('file')).toBe(original)
    expect((init.body as FormData).get('body')).toBe('원래 설명')
  }
  expect(screen.getByRole('img', { name: 'draft.png' })).toBeTruthy()
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('새 설명')
})

it('여러 이미지는 첫 이미지 첨부를 안내하고 용량 제한을 넘는 이미지는 전송하지 않는다', async () => {
  const fetch = vi.fn()
  mount(fetch)
  paste(['first.png', 'second.png'].map((name) => new File(['pixels'], name, { type: 'image/png' })))
  await screen.findByRole('img', { name: 'first.png' })
  expect(screen.getByText('여러 파일 중 첫 번째만 첨부됩니다.')).toBeTruthy()
  const oversized = new File(['pixels'], 'too-big.png', { type: 'image/png' })
  Object.defineProperty(oversized, 'size', { value: 26214401 })
  paste([oversized])
  expect(screen.getByText('파일이 너무 큽니다 (최대 25MB).')).toBeTruthy()
  expect(screen.queryByRole('img')).toBeNull()
  expect((screen.getByRole('button', { name: '보내기' }) as HTMLButtonElement).disabled).toBe(true)
  expect(fetch).not.toHaveBeenCalled()
})
