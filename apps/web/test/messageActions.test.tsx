import type { MessageDto } from '@deuce/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { conversationKey, messagesKey } from '../src/api/queries'
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
      <div className="timeline">
        <MessageBubble m={m} isMine={isMine} meId={meId} memberNames={[]} onReply={() => {}} />
      </div>
    </QueryClientProvider>,
  )
  return qc
}

function lastCall(fn: ReturnType<typeof jsonStub>): [string, RequestInit] {
  return fn.mock.calls[fn.mock.calls.length - 1] as [string, RequestInit]
}

// 더보기 메뉴를 연다 — 답장/고정/삭제는 이 메뉴 뒤에 있다
async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: '더 보기' }))
}

afterEach(() => vi.unstubAllGlobals())

describe('MessageBubble 액션', () => {
  it('빠른 반응을 누르면 PUT으로 추가한다', async () => {
    const fn = jsonStub(msg({ reactions: [{ emoji: '👍', userIds: [meId] }] }))
    renderBubble(msg({}), fn)
    const quickReaction = screen.getByRole('button', { name: '👍' })
    expect(quickReaction.querySelector('img')?.getAttribute('src')).toBe('/fluent-emoji/thumbs-up.png')
    await userEvent.click(quickReaction)
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

  it('반응 성공 시 대화 상세(고정 배너)를 재조회하지 않는다', async () => {
    const fn = jsonStub(msg({ reactions: [{ emoji: '👍', userIds: [meId] }] }))
    const qc = renderBubble(msg({}), fn, true, [msg({ id: 'm2' }), msg({})])
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await userEvent.click(screen.getByRole('button', { name: '👍' }))
    await waitFor(() => {
      const items = qc.getQueryData<MessagesData>(messagesKey('c1'))?.pages[0]?.items
      expect(items?.[1]?.reactions).toEqual([{ emoji: '👍', userIds: [meId] }])
    })
    expect(spy).not.toHaveBeenCalledWith({ queryKey: conversationKey('c1') })
  })

  it('삭제 204 응답 뒤 타임라인을 재조회한다', async () => {
    const fn = jsonStub(null, 204)
    const qc = renderBubble(msg({}), fn)
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: '삭제' }))
    await userEvent.click(screen.getByRole('menuitem', { name: '정말 삭제' }))
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
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: '고정' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: messagesKey('c1') }))
  })

  it('고정 성공 시 대화 상세(고정 배너)를 즉시 재조회한다', async () => {
    const fn = jsonStub(msg({ pinnedAt: '2026-08-29T01:00:00.000Z' }))
    const qc = renderBubble(msg({}), fn)
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: '고정' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: conversationKey('c1') }))
  })

  it('고정된 메시지는 해제 메뉴 항목을 보여준다', async () => {
    const fn = jsonStub(msg({ pinnedAt: null }))
    renderBubble(msg({ pinnedAt: '2026-08-29T01:00:00.000Z' }), fn)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: '고정 해제' }))
    await waitFor(() => expect(fn).toHaveBeenCalled())
    const [path, init] = lastCall(fn)
    expect(path).toBe('/api/messages/m1/pin')
    expect(init.method).toBe('DELETE')
  })

  it('답장 메뉴 항목이 onReply를 호출한다', async () => {
    const fn = jsonStub(msg({}))
    vi.stubGlobal('fetch', fn)
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const onReply = vi.fn()
    const m = msg({})
    render(
      <QueryClientProvider client={qc}>
        <MessageBubble m={m} isMine={true} meId={meId} memberNames={[]} onReply={onReply} />
      </QueryClientProvider>,
    )
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: '따옴표로 회신' }))
    expect(onReply).toHaveBeenCalledWith(m)
  })

  it('남의 메시지에는 수정 버튼과 삭제 메뉴 항목이 없다', async () => {
    renderBubble(msg({}), jsonStub(msg({})), false)
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull()
    await openMenu()
    expect(screen.queryByRole('menuitem', { name: '삭제' })).toBeNull()
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
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: '삭제' }))
    expect(fn).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('menuitem', { name: '정말 삭제' }))
    await waitFor(() => expect(fn).toHaveBeenCalled())
    const [path, init] = lastCall(fn)
    expect(path).toBe('/api/messages/m1')
    expect(init.method).toBe('DELETE')
  })

  it('삭제 확인은 취소로 되돌릴 수 있다', async () => {
    const fn = jsonStub(null, 204)
    renderBubble(msg({}), fn)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: '삭제' }))
    await userEvent.click(screen.getByRole('menuitem', { name: '취소' }))
    expect(screen.queryByRole('menuitem', { name: '정말 삭제' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: '삭제' })).toBeTruthy()
    expect(fn).not.toHaveBeenCalled()
  })

  it('수정으로 들어가면 삭제 확인이 풀린다', async () => {
    const fn = jsonStub(null, 204)
    renderBubble(msg({ body: '원본' }), fn)
    await openMenu()
    await userEvent.click(screen.getByRole('menuitem', { name: '삭제' }))
    await userEvent.click(screen.getByRole('button', { name: '수정' }))
    await userEvent.click(screen.getByRole('button', { name: '취소' })) // 편집 취소
    expect(screen.queryByRole('menuitem', { name: '정말 삭제' })).toBeNull()
    expect(fn).not.toHaveBeenCalled()
  })

  it('반응 추가 팔레트에서 이모지를 고르면 반응을 보낸다', async () => {
    const fn = jsonStub(msg({ reactions: [{ emoji: '🎉', userIds: [meId] }] }))
    renderBubble(msg({}), fn)
    await userEvent.click(screen.getByRole('button', { name: '반응 추가' }))
    const partyPopper = screen.getByRole('button', { name: '🎉' })
    expect(partyPopper.querySelector('img')?.getAttribute('src')).toBe('/fluent-emoji/party-popper.png')
    await userEvent.click(partyPopper)
    await waitFor(() => expect(fn).toHaveBeenCalled())
    const [path, init] = lastCall(fn)
    expect(path).toBe('/api/messages/m1/reactions')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ emoji: '🎉' })
    expect(screen.queryByRole('button', { name: '🎉' })).toBeNull() // 선택 후 팔레트가 닫힌다
  })

  it('팔레트가 열려 있으면 Escape로 닫힌다', async () => {
    renderBubble(msg({}), jsonStub(msg({})))
    await userEvent.click(screen.getByRole('button', { name: '반응 추가' }))
    expect(screen.getByRole('button', { name: '🎉' })).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: '🎉' })).toBeNull()
  })

  it('더보기 메뉴가 열려 있으면 Escape로 닫힌다', async () => {
    renderBubble(msg({}), jsonStub(msg({})))
    await openMenu()
    expect(screen.getByRole('menu')).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('팔레트와 메뉴는 동시에 하나만 열린다', async () => {
    renderBubble(msg({}), jsonStub(msg({})))
    await userEvent.click(screen.getByRole('button', { name: '반응 추가' }))
    expect(screen.getByRole('button', { name: '🎉' })).toBeTruthy()
    await openMenu()
    expect(screen.queryByRole('button', { name: '🎉' })).toBeNull()
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('바깥을 클릭하면 메뉴가 닫힌다', async () => {
    renderBubble(msg({}), jsonStub(msg({})))
    await openMenu()
    expect(screen.getByRole('menu')).toBeTruthy()
    await userEvent.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('내 메시지의 액션 바는 한 줄에 반응4+반응추가+수정+더보기 7개 버튼을 담는다', () => {
    renderBubble(msg({}), jsonStub(msg({})), true)
    const bar = document.querySelector('.msg-actions')
    expect(bar).toBeTruthy()
    expect(bar?.getAttribute('style') ?? '').not.toContain('wrap: wrap')
    expect(bar?.querySelectorAll(':scope > button')).toHaveLength(7)
  })

  it('액션 바는 본문 밖 말풍선 경계에 배치된다', () => {
    renderBubble(msg({ body: '가리지 않아야 할 본문' }), jsonStub(msg({})), true)
    const bar = document.querySelector('.msg-actions')
    expect(bar?.parentElement?.classList.contains('msg-bubble-wrap')).toBe(true)
    expect(bar?.nextElementSibling?.classList.contains('bubble')).toBe(true)
    expect(bar?.closest('.bubble')).toBeNull()
  })

  it('남의 메시지 액션 바는 수정 버튼 없이 6개 버튼을 담는다', () => {
    renderBubble(msg({}), jsonStub(msg({})), false)
    const bar = document.querySelector('.msg-actions')
    expect(bar?.querySelectorAll(':scope > button')).toHaveLength(6)
  })
})

describe('팝오버 열림 방향', () => {
  afterEach(() => vi.restoreAllMocks())

  // 타임라인 상단(40px)·액션 바 위치·팝오버 높이를 흉내 낸다 — jsdom에는 레이아웃이 없다
  function stubLayout({ barTop, popoverHeight }: { barTop: number; popoverHeight: number }) {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const top = this.classList.contains('timeline') ? 40 : this.classList.contains('msg-actions') ? barTop : 0
      return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON: () => ({}) } as DOMRect
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('msg-menu') || this.classList.contains('reaction-palette') ? popoverHeight : 0
    })
  }

  const bar = () => document.querySelector('.msg-actions')

  it('타임라인 맨 위 메시지의 더보기 메뉴는 아래로 연다', async () => {
    stubLayout({ barTop: 48, popoverHeight: 120 }) // 위쪽 공간 8px < 메뉴 120px
    renderBubble(msg({}), jsonStub(msg({})))
    await openMenu()
    expect(bar()?.classList.contains('open-below')).toBe(true)
  })

  it('타임라인 맨 위 메시지의 반응 팔레트는 아래로 연다', async () => {
    stubLayout({ barTop: 48, popoverHeight: 200 })
    renderBubble(msg({}), jsonStub(msg({})))
    await userEvent.click(screen.getByRole('button', { name: '반응 추가' }))
    expect(bar()?.classList.contains('open-below')).toBe(true)
  })

  it('위쪽 공간이 충분하면 메뉴를 위로 연다', async () => {
    stubLayout({ barTop: 400, popoverHeight: 120 }) // 위쪽 공간 360px
    renderBubble(msg({}), jsonStub(msg({})))
    await openMenu()
    expect(bar()?.classList.contains('open-below')).toBe(false)
  })
})
