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
  return members
    .filter((u) => text.includes(`@${u.name}`))
    .map((u) => u.id)
    .slice(0, 20) // 서버 계약: mentions 최대 20
}
