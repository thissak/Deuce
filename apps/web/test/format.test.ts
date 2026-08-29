import { describe, expect, it } from 'vitest'
import { formatBytes, formatTime, truncate } from '../src/lib/format'

describe('format', () => {
  it('오늘 시각은 HH:MM', () => {
    const now = new Date()
    now.setHours(9, 5, 0, 0)
    expect(formatTime(now.toISOString())).toBe('09:05')
  })

  it('과거 날짜는 M월 D일', () => {
    expect(formatTime('2020-03-07T12:00:00.000Z')).toBe('3월 7일')
  })

  it('바이트 표기', () => {
    expect(formatBytes(500)).toBe('500B')
    expect(formatBytes(2048)).toBe('2.0KB')
    expect(formatBytes(26214400)).toBe('25.0MB')
  })

  it('truncate', () => {
    expect(truncate('안녕하세요', 3)).toBe('안녕하…')
    expect(truncate('hi', 10)).toBe('hi')
  })
})
