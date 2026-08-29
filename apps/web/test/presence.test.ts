import { describe, expect, it } from 'vitest'
import { presenceOf } from '../src/components/PresenceDot'

describe('presenceOf', () => {
  it('스냅샷에 없으면 오프라인', () => {
    expect(presenceOf(undefined, 'u1')).toBe('offline')
    expect(presenceOf({}, 'u1')).toBe('offline')
  })

  it('스냅샷 상태를 그대로 반환', () => {
    expect(presenceOf({ u1: 'online' }, 'u1')).toBe('online')
    expect(presenceOf({ u1: 'away' }, 'u1')).toBe('away')
  })
})
