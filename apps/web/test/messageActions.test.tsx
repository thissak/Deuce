import type { MessageDto } from '@deuce/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { messagesKey } from '../src/api/queries'
import { MessageBubble } from '../src/components/MessageBubble'
import type { MessagesData } from '../src/realtime/cache'
import { msg } from './fixtures'

const meId = 'u1'

function jsonStub(payload: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(status === 204 ? null : JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

function renderBubble(m: MessageDto, fn: ReturnType<typeof jsonStub>, isMine = true, seed?: MessageDto[]) {
  vi.stubGlobal('fetch', fn)
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  if (seed) {
    qc.setQueryData<MessagesData>(messagesKey('c1'), {
      pages: [{ items: seed, nextCursor: null }],
      pageParams: [''],
    })
  }
  render(
    <QueryClientProvider client={qc}>
      <MessageBubble m={m} isMine={isMine} meId={meId} memberNames={[]} onReply={() => {}} />
    </QueryClientProvider>,
  )
  return qc
}

function lastCall(fn: ReturnType<typeof jsonStub>): [string, RequestInit] {
  return fn.mock.calls[fn.mock.calls.length - 1] as [string, RequestInit]
}

afterEach(() => vi.unstubAllGlobals())

describe('MessageBubble 액션', () => {
  it('반응 팔레트를 누르면 PUT으로 추가한다', async () => {
    const fn = jsonStub(msg({ reactions: [{ emoji: '👍', userIds: [meId] }] }))
    renderBubble(msg({}), fn)
    await userEvent.click(screen.getByRole('button', { name: '👍' }))
    await waitFor(() => expect(fn).toHaveBeenCalled())
    const [path, init] = lastCall(fn)
    expect(path).toBe('/api/messages/m1/reactions')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ emoji: '👍' })
  })

  it('반응 200 응답을 캐시의 해당 메시지에 반영한다', async () => {
    const fn = jsonStub(msg({ reactions: [{ emoji: '👍', userIds: [meId] }] }))
    const qc = renderBubble(msg({}), fn, true, [msg({ id: 'm2' }), msg({})])
    await userEvent.click(screen.getByRole('button', { name: '👍' }))
    await waitFor(() => {
      const items = qc.getQueryData<MessagesData>(messagesKey('c1'))?.pages[0]?.items
      expect(items?.[1]?.reactions).toEqual([{ emoji: '👍', userIds: [meId] }])
      expect(items?.[0]?.reactions).toEqual([]) // 다른 메시지는 건드리지 않는다
    })
  })

  it('삭제 204 응답 뒤 타임라인을 재조회한다', async () => {
    const fn = jsonStub(null, 204)
    const qc = renderBubble(msg({}), fn)
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    await userEvent.click(screen.getByRole('button', { name: '정말 삭제' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: messagesKey('c1') }))
  })

  it('내 반응 칩을 다시 누르면 DELETE로 취소한다 (이모지는 URL 인코딩)', async () => {
    const fn = jsonStub(msg({ reactions: [] }))
    renderBubble(msg({ reactions: [{ emoji: '👍', userIds: [meId] }] }), fn)
    await userEvent.click(screen.getByRole('button', { name: '👍 1' }))
    await waitFor(() => expect(fn).toHaveBeenCalled())
    const [path, init] = lastCall(fn)
    expect(path).toBe(`/api/messages/m1/reactions/${encodeURIComponent('👍')}`)
    expect(init.method).toBe('DELETE')
  })

  it('액션이 404면 타임라인을 재조회한다', async () => {
    const fn = jsonStub({ error: 'message not found' }, 404)
    const qc = renderBubble(msg({}), fn)
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await userEvent.click(screen.getByRole('button', { name: '고정' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: messagesKey('c1') }))
  })

  it('고정된 메시지는 해제 버튼을 보여준다', async () => {
    const fn = jsonStub(msg({ pinnedAt: null }))
    renderBubble(msg({ pinnedAt: '2026-08-29T01:00:00.000Z' }), fn)
    await userEvent.click(screen.getByRole('button', { name: '고정 해제' }))
    await waitFor(() => expect(fn).toHaveBeenCalled())
    const [path, init] = lastCall(fn)
    expect(path).toBe('/api/messages/m1/pin')
    expect(init.method).toBe('DELETE')
  })

  it('남의 메시지에는 수정·삭제가 없다', () => {
    renderBubble(msg({}), jsonStub(msg({})), false)
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull()
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull()
  })

  it('수정은 인라인 편집 후 PATCH로 저장한다', async () => {
    const fn = jsonStub(msg({ body: '고침', editedAt: '2026-08-29T01:00:00.000Z' }))
    renderBubble(msg({ body: '원본' }), fn)
    await userEvent.click(screen.getByRole('button', { name: '수정' }))
    const box = screen.getByRole('textbox')
    expect((box as HTMLTextAreaElement).value).toBe('원본')
    await userEvent.clear(box)
    await userEvent.type(box, '고침')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(fn).toHaveBeenCalled())
    const [path, init] = lastCall(fn)
    expect(path).toBe('/api/messages/m1')
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ body: '고침' })
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull()) // 성공해야 편집이 닫힌다
  })

  it('수정이 실패하면 편집 모드와 입력을 유지하고 안내한다', async () => {
    const fn = jsonStub({ error: 'author only' }, 403)
    renderBubble(msg({ body: '원본' }), fn)
    await userEvent.click(screen.getByRole('button', { name: '수정' }))
    await userEvent.clear(screen.getByRole('textbox'))
    await userEvent.type(screen.getByRole('textbox'), '고침')
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText(/수정에 실패했습니다/)).toBeTruthy()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('고침')
  })

  it('삭제는 두 단계 확인을 거친다', async () => {
    const fn = jsonStub(null, 204)
    renderBubble(msg({}), fn)
    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    expect(fn).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '정말 삭제' }))
    await waitFor(() => expect(fn).toHaveBeenCalled())
    const [path, init] = lastCall(fn)
    expect(path).toBe('/api/messages/m1')
    expect(init.method).toBe('DELETE')
  })

  it('삭제 확인은 취소로 되돌릴 수 있다', async () => {
    const fn = jsonStub(null, 204)
    renderBubble(msg({}), fn)
    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    await userEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('button', { name: '정말 삭제' })).toBeNull()
    expect(screen.getByRole('button', { name: '삭제' })).toBeTruthy()
    expect(fn).not.toHaveBeenCalled()
  })

  it('수정으로 들어가면 삭제 확인이 풀린다', async () => {
    const fn = jsonStub(null, 204)
    renderBubble(msg({ body: '원본' }), fn)
    await userEvent.click(screen.getByRole('button', { name: '삭제' }))
    await userEvent.click(screen.getByRole('button', { name: '수정' }))
    await userEvent.click(screen.getByRole('button', { name: '취소' })) // 편집 취소
    expect(screen.queryByRole('button', { name: '정말 삭제' })).toBeNull()
    expect(fn).not.toHaveBeenCalled()
  })
})
