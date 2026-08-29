import type { MessageDto } from '@deuce/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { messagesKey } from '../src/api/queries'
import { MessageBubble } from '../src/components/MessageBubble'
import { msg } from './cache.test'

const meId = 'u1'

function jsonStub(payload: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(status === 204 ? null : JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

function renderBubble(m: MessageDto, fn: ReturnType<typeof jsonStub>, isMine = true) {
  vi.stubGlobal('fetch', fn)
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
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
})
