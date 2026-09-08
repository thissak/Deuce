import type { QueryClient } from '@tanstack/react-query'
import type { ConversationSummary, MessageDto } from '@deuce/shared'
import { conversationsKey } from '../api/queries'
import { truncate } from './format'

export function maybeNotify(
  qc: QueryClient,
  meId: string,
  m: MessageDto,
  onOpen: (conversationId: string) => void,
): void {
  if (m.author.id === meId || m.deleted) return
  if (!document.hidden) return
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const convo = qc
    .getQueryData<ConversationSummary[]>(conversationsKey)
    ?.find((c) => c.id === m.conversationId)
  if (convo?.mutedAt) return
  const body = m.attachments.length > 0 ? `📎 ${m.attachments[0]!.fileName}` : truncate(m.body, 80)
  const n = new Notification(m.author.name, { body })
  n.onclick = () => {
    (window as Window & { deuceDesktop?: { focus: () => void } }).deuceDesktop?.focus()
    window.focus()
    onOpen(m.conversationId)
  }
}
