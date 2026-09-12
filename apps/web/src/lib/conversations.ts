import type { ConversationSummary } from '@deuce/shared'

export type ConvoFilter = 'all' | 'unread' | 'chats' | 'channels'

export function filterConversations(list: ConversationSummary[], filter: ConvoFilter): ConversationSummary[] {
  if (filter === 'unread') return list.filter((c) => c.unreadCount > 0)
  if (filter === 'channels') return list.filter((c) => c.type === 'CHANNEL')
  if (filter === 'chats') return list.filter((c) => c.type !== 'CHANNEL')
  return list
}

export function previewText(c: ConversationSummary): string {
  if (!c.lastMessage) return '메시지 없음'
  return `${c.lastMessage.authorName}: ${c.lastMessage.body}`
}
