import { useEffect, useState } from 'react'
import type { MessagePage } from '@deuce/shared'

const MAX_PAGES = 20 // 약 1,000개 이전까지만 자동 탐색 — 초과분은 중단(레저 기록)

/** useInfiniteQuery 결과 중 점프에 필요한 부분만 (pageParam 타입에 묶이지 않도록 구조적으로 선언) */
interface JumpSource {
  data: { pages: MessagePage[] } | undefined
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => Promise<unknown>
}

function scrollToMessage(id: string): void {
  const el = document.getElementById(`msg-${id}`)
  if (!el) return
  el.scrollIntoView({ block: 'center' })
  el.classList.add('highlight')
  setTimeout(() => el.classList.remove('highlight'), 2000)
}

export function useJumpToMessage(q: JumpSource): (messageId: string) => void {
  const [target, setTarget] = useState<string | null>(null)

  useEffect(() => {
    if (!target || q.isFetchingNextPage) return
    const loaded = q.data?.pages.some((p) => p.items.some((i) => i.id === target))
    if (loaded) {
      requestAnimationFrame(() => scrollToMessage(target))
      setTarget(null)
    } else if (q.hasNextPage && (q.data?.pages.length ?? 0) < MAX_PAGES) {
      void q.fetchNextPage()
    } else if (q.data) {
      setTarget(null) // 더 못 찾음 — 조용히 중단
    }
  }, [target, q])

  return setTarget
}
