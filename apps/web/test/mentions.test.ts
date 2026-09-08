import { describe, expect, it } from 'vitest'
import { collectMentionIds, mentionQueryAt } from '../src/lib/mentions'

const members = [
  { id: 'u1', email: 'a@x.com', name: '김철수', avatarUrl: null },
  { id: 'u2', email: 'b@x.com', name: '이영희', avatarUrl: null },
]

describe('mentionQueryAt', () => {
  it('문두 @ 진행 중 쿼리를 찾는다', () => {
    expect(mentionQueryAt('@김', 2)).toEqual({ start: 0, query: '김' })
  })

  it('공백 뒤 @만 인정한다', () => {
    expect(mentionQueryAt('메일주소a@b', 11)).toBeNull()
    expect(mentionQueryAt('안녕 @이', 5)).toEqual({ start: 3, query: '이' })
  })

  it('쿼리에 공백이 들어가면 종료된 것으로 본다', () => {
    expect(mentionQueryAt('@김철수 감사', 7)).toBeNull()
  })
})

describe('collectMentionIds', () => {
  it('본문에 남아 있는 @이름의 멤버 id를 모은다', () => {
    expect(collectMentionIds('@김철수 확인 부탁드립니다', members)).toEqual(['u1'])
    expect(collectMentionIds('@김철수 @이영희', members)).toEqual(['u1', 'u2'])
    expect(collectMentionIds('멘션 없음', members)).toEqual([])
  })

  it('접두가 겹치는 이름은 긴 이름을 정확히 매칭한다', () => {
    const members = [
      { id: 'u1', email: 'a@x.com', name: '김철', avatarUrl: null },
      { id: 'u2', email: 'b@x.com', name: '김철수', avatarUrl: null },
    ]
    expect(collectMentionIds('@김철수 확인요', members)).toEqual(['u2'])
    expect(collectMentionIds('@김철 @김철수', members).sort()).toEqual(['u1', 'u2'])
  })
})

it('AI 실행은 정확한 멘션만 인식하며 이메일과 긴 단어를 요청으로 해석하지 않는다', () => {
  const ai = { id: 'ai', email: '', name: 'Codex', avatarUrl: null, isAgent: true }
  expect(collectMentionIds('user@Codex.example 또는 @CodexOther', [ai])).toEqual([])
  expect(collectMentionIds('@Codex 요약해 주세요', [ai])).toEqual(['ai'])
  expect(collectMentionIds('확인 @Codex!', [ai])).toEqual(['ai'])
})
