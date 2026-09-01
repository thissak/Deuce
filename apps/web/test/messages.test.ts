import { describe, expect, it } from 'vitest'
import { hasMyReaction, QUICK_REACTIONS, REACTION_PALETTE } from '../src/lib/messages'
import { msg } from './fixtures'

describe('reactions', () => {
  it('빠른 반응은 4종', () => {
    expect(QUICK_REACTIONS).toHaveLength(4)
  })

  it('팔레트는 빠른 반응에서 빠진 이모지를 포함한다', () => {
    for (const e of ['😢', '🙏']) expect(REACTION_PALETTE).toContain(e)
  })

  it('내 반응 여부를 판별한다', () => {
    const m = msg({ reactions: [{ emoji: '👍', userIds: ['u1', 'u2'] }] })
    expect(hasMyReaction(m, '👍', 'u1')).toBe(true)
    expect(hasMyReaction(m, '👍', 'u9')).toBe(false)
    expect(hasMyReaction(m, '❤️', 'u1')).toBe(false)
  })
})
