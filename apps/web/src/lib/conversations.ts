import type { ConversationSummary } from '@deuce/shared'

export type ConvoFilter = 'all' | 'unread'

export function filterConversations(list: ConversationSummary[], filter: ConvoFilter): ConversationSummary[] {
  return filter === 'unread' ? list.filter((c) => c.unreadCount > 0) : list
}

export function previewText(c: ConversationSummary): string {
  if (!c.lastMessage) return '메시지 없음'
  return `${c.lastMessage.authorName}: ${c.lastMessage.body}`
}
