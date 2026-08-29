import type { MessageDto } from '@deuce/shared'

export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const

export function hasMyReaction(m: MessageDto, emoji: string, meId: string): boolean {
  return m.reactions.some((r) => r.emoji === emoji && r.userIds.includes(meId))
}
