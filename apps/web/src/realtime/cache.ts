import type { InfiniteData } from '@tanstack/react-query'
import type { MessageDto, MessagePage, PresencePayload, PresenceSnapshot } from '@deuce/shared'

export type MessagesData = InfiniteData<MessagePage, string>

/** m 자신은 교체하고, m을 인용한 답장은 인용 본문·삭제 상태만 따라간다 (다른 탭의 수정·삭제 반영) */
function withUpdated(i: MessageDto, m: MessageDto): MessageDto | null {
  if (i.id === m.id) return m
  if (i.replyTo && i.replyTo.id === m.id) return { ...i, replyTo: { ...i.replyTo, body: m.body, deleted: m.deleted } }
  return null
}

export function replaceMessage(data: MessagesData | undefined, m: MessageDto): MessagesData | undefined {
  if (!data) return data
  let changed = false
  const pages = data.pages.map((p) => {
    let items: MessageDto[] | null = null
    p.items.forEach((i, idx) => {
      const next = withUpdated(i, m)
      if (!next) return
      items ??= p.items.slice()
      items[idx] = next
    })
    if (!items) return p
    changed = true
    return { ...p, items }
  })
  return changed ? { ...data, pages } : data
}

export function appendMessage(data: MessagesData | undefined, m: MessageDto): MessagesData | undefined {
  if (!data || data.pages.length === 0) return data
  if (data.pages.some((p) => p.items.some((i) => i.id === m.id))) return replaceMessage(data, m)
  const [first, ...rest] = data.pages
  return { ...data, pages: [{ ...first!, items: [m, ...first!.items] }, ...rest] }
}

export function patchPresence(map: PresenceSnapshot | undefined, p: PresencePayload): PresenceSnapshot {
  const next: PresenceSnapshot = { ...(map ?? {}) }
  if (p.status === 'offline') delete next[p.userId]
  else next[p.userId] = p.status
  return next
}
