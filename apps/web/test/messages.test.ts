import { describe, expect, it } from 'vitest'
import { getReactionOption, hasMyReaction, QUICK_REACTIONS, REACTION_PALETTE } from '../src/lib/messages'
import { msg } from './fixtures'

describe('reactions', () => {
  it('빠른 반응은 4종', () => {
    expect(QUICK_REACTIONS).toHaveLength(4)
    expect(QUICK_REACTIONS.map((option) => option.emoji)).toEqual(['👍', '❤️', '😂', '😮'])
  })

  it('공식 Fluent 3D 자산 40종을 중복 없이 제공한다', () => {
    expect(REACTION_PALETTE).toHaveLength(40)
    expect(new Set(REACTION_PALETTE.map((option) => option.emoji)).size).toBe(40)
    expect(new Set(REACTION_PALETTE.map((option) => option.asset)).size).toBe(40)
    for (const option of REACTION_PALETTE) expect(option.asset).toMatch(/^\/fluent-emoji\/.+\.png$/)
    for (const emoji of ['😢', '🙏', '✨']) expect(getReactionOption(emoji)?.emoji).toBe(emoji)
  })

  it('내 반응 여부를 판별한다', () => {
    const m = msg({ reactions: [{ emoji: '👍', userIds: ['u1', 'u2'] }] })
    expect(hasMyReaction(m, '👍', 'u1')).toBe(true)
    expect(hasMyReaction(m, '👍', 'u9')).toBe(false)
    expect(hasMyReaction(m, '❤️', 'u1')).toBe(false)
  })
})
