import type { MessageDto } from '@deuce/shared'

export function msg(over: Partial<MessageDto>): MessageDto {
  return {
    id: 'm1', conversationId: 'c1',
    author: { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null },
    body: '안녕', deleted: false, replyTo: null, reactions: [], mentions: [], attachments: [],
    createdAt: '2026-08-29T00:00:00.000Z', editedAt: null, pinnedAt: null, ...over,
  }
}
