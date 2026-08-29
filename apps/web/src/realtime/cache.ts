import type { InfiniteData } from '@tanstack/react-query'
import type { MessageDto, MessagePage, PresencePayload, PresenceSnapshot } from '@deuce/shared'

export type MessagesData = InfiniteData<MessagePage, string>

export function replaceMessage(data: MessagesData | undefined, m: MessageDto): MessagesData | undefined {
  if (!data) return data
  let changed = false
  const pages = data.pages.map((p) => {
    const idx = p.items.findIndex((i) => i.id === m.id)
    if (idx === -1) return p
    changed = true
    const items = p.items.slice()
    items[idx] = m
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
