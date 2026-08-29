import type { MessageDto } from '@deuce/shared'
import { describe, expect, it } from 'vitest'
import { appendMessage, patchPresence, replaceMessage, type MessagesData } from '../src/realtime/cache'

export function msg(over: Partial<MessageDto>): MessageDto {
  return {
    id: 'm1', conversationId: 'c1',
    author: { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null },
    body: '안녕', deleted: false, replyTo: null, reactions: [], mentions: [], attachments: [],
    createdAt: '2026-08-29T00:00:00.000Z', editedAt: null, pinnedAt: null, ...over,
  }
}

function data(pages: MessageDto[][]): MessagesData {
  return {
    pages: pages.map((items) => ({ items, nextCursor: null })),
    pageParams: pages.map(() => ''),
  }
}

describe('cache updaters', () => {
  it('appendMessage는 첫 페이지 맨 앞에 넣는다 (최신순)', () => {
    const d = appendMessage(data([[msg({ id: 'old' })]]), msg({ id: 'new' }))
    expect(d?.pages[0]?.items.map((m) => m.id)).toEqual(['new', 'old'])
  })

  it('appendMessage는 이미 있으면 교체한다 (REST 성공 + 소켓 수신 중복)', () => {
    const d = appendMessage(data([[msg({ id: 'm1', body: '이전' })]]), msg({ id: 'm1', body: '이후' }))
    expect(d?.pages[0]?.items).toHaveLength(1)
    expect(d?.pages[0]?.items[0]?.body).toBe('이후')
  })

  it('appendMessage는 캐시가 없으면 아무것도 만들지 않는다', () => {
    expect(appendMessage(undefined, msg({}))).toBeUndefined()
  })

  it('replaceMessage는 뒤 페이지의 항목도 교체한다', () => {
    const d = replaceMessage(data([[msg({ id: 'a' })], [msg({ id: 'b', body: '이전' })]]), msg({ id: 'b', body: '이후' }))
    expect(d?.pages[1]?.items[0]?.body).toBe('이후')
  })

  it('replaceMessage는 없는 id면 원본을 그대로 반환한다', () => {
    const original = data([[msg({ id: 'a' })]])
    expect(replaceMessage(original, msg({ id: 'zzz' }))).toBe(original)
  })

  it('patchPresence는 offline이면 키를 지운다', () => {
    expect(patchPresence({ u1: 'online' }, { userId: 'u1', status: 'offline' })).toEqual({})
    expect(patchPresence(undefined, { userId: 'u2', status: 'away' })).toEqual({ u2: 'away' })
  })
})
