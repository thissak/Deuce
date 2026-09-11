import type { ConversationSummary } from '@deuce/shared'
import { describe, expect, it } from 'vitest'
import { filterConversations, previewText } from '../src/lib/conversations'

function convo(over: Partial<ConversationSummary>): ConversationSummary {
  return {
    id: 'c1', type: 'DM', title: null, displayName: '김철수', members: [],
    lastMessage: null, unreadCount: 0, mutedAt: null, ...over,
  }
}

describe('conversations', () => {
  it('읽지 않음 필터는 unreadCount>0만 남긴다', () => {
    const list = [convo({ id: 'a', unreadCount: 0 }), convo({ id: 'b', unreadCount: 3 })]
    expect(filterConversations(list, 'unread').map((c) => c.id)).toEqual(['b'])
    expect(filterConversations(list, 'all')).toHaveLength(2)
  })

  it('대화와 채널을 종류별로 분리한다', () => {
    const list = [
      convo({ id: 'dm', type: 'DM' }),
      convo({ id: 'group', type: 'GROUP' }),
      convo({ id: 'channel', type: 'CHANNEL' }),
    ]
    expect(filterConversations(list, 'chats').map((c) => c.id)).toEqual(['dm', 'group'])
    expect(filterConversations(list, 'channels').map((c) => c.id)).toEqual(['channel'])
  })

  it('미리보기는 "작성자: 본문", 없으면 "메시지 없음"', () => {
    expect(previewText(convo({}))).toBe('메시지 없음')
    expect(previewText(convo({
      lastMessage: { id: 'm', body: '안녕', authorName: '김철수', createdAt: '2026-08-29T00:00:00.000Z' },
    }))).toBe('김철수: 안녕')
  })
})
