import { describe, expect, it } from 'vitest'
import { hasMyReaction, REACTION_EMOJIS } from '../src/lib/messages'
import { msg } from './fixtures'

describe('reactions', () => {
  it('팔레트는 6종', () => {
    expect(REACTION_EMOJIS).toHaveLength(6)
  })

  it('내 반응 여부를 판별한다', () => {
    const m = msg({ reactions: [{ emoji: '👍', userIds: ['u1', 'u2'] }] })
    expect(hasMyReaction(m, '👍', 'u1')).toBe(true)
    expect(hasMyReaction(m, '👍', 'u9')).toBe(false)
    expect(hasMyReaction(m, '❤️', 'u1')).toBe(false)
  })
})
