import type { UserDto } from '@deuce/shared'

export function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const upto = text.slice(0, caret)
  const at = upto.lastIndexOf('@')
  if (at === -1) return null
  if (at > 0 && !/\s/.test(upto[at - 1]!)) return null
  const query = upto.slice(at + 1)
  if (/[\s@]/.test(query)) return null
  return { start: at, query }
}

export function collectMentionIds(text: string, members: UserDto[]): string[] {
  // 긴 이름 우선 — "@김철수"가 "김철"로도 매칭되지 않게 (renderMentions와 같은 규칙)
  const sorted = members.filter(u => !u.isAgent).sort((a, b) => b.name.length - a.name.length)
  const ids = new Set<string>()
  let at = text.indexOf('@')
  while (at !== -1) {
    const hit = sorted.find((u) => text.startsWith(`@${u.name}`, at))
    if (hit) ids.add(hit.id)
    at = text.indexOf('@', at + 1 + (hit ? hit.name.length : 0))
  }
  return [...ids].slice(0, 20) // 서버 계약: mentions 최대 20
}
