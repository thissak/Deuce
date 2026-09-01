import type { MessageDto } from '@deuce/shared'

/** 액션 바에 항상 보이는 빠른 반응 (Teams 순서) */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮'] as const

/** "반응 추가" 팔레트 그리드 — 빠른 반응에서 빠진 😢·🙏 포함 */
export const REACTION_PALETTE = [
  '👍', '❤️', '😂', '😮', '😢', '🙏',
  '😡', '🎉', '🔥', '👏', '🙌', '💯',
  '😍', '🤔', '😅', '😎', '🥳', '😴',
  '👀', '✅', '❌', '🚀', '💡', '⭐',
] as const

export function hasMyReaction(m: MessageDto, emoji: string, meId: string): boolean {
  return m.reactions.some((r) => r.emoji === emoji && r.userIds.includes(meId))
}
