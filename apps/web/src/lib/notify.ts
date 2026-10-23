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
  // 보이는 창이라도 다른 앱 뒤에 있거나 포커스를 잃었으면 알린다(데스크톱 창이 가려진 경우 hidden이 false로 남는다).
  if (!document.hidden && document.hasFocus()) return
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
