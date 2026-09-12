import type { MessageDto, UserDto } from '@deuce/shared'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { apiJson } from '../api/http'
import { conversationsKey, messagesQuery } from '../api/queries'
import { useJumpToMessage } from '../lib/useJumpToMessage'
import { ErrorNotice } from './ErrorNotice'
import { MessageBubble } from './MessageBubble'

/** 탭 표시 중이고 데스크톱 창에 포커스가 있을 때 읽음 커서를 전진시킨다. 서버가 후퇴를 막아준다. */
function useAdvanceRead(conversationId: string, newestMessageId: string | undefined): void {
  const qc = useQueryClient()
  const sentRef = useRef<string | null>(null)
  useEffect(() => {
    const send = () => {
      if (!newestMessageId || document.hidden || sentRef.current === newestMessageId) return
      if (window.deuceDesktop && !document.hasFocus()) return
      sentRef.current = newestMessageId
      apiJson('PUT', `/api/conversations/${conversationId}/read`, { messageId: newestMessageId })
        .then(() => qc.invalidateQueries({ queryKey: conversationsKey }))
        .catch(() => {
          sentRef.current = null // 실패 시 다음 기회에 재시도
        })
    }
    send()
    document.addEventListener('visibilitychange', send)
    window.addEventListener('focus', send)
    return () => {
      document.removeEventListener('visibilitychange', send)
      window.removeEventListener('focus', send)
    }
  }, [conversationId, newestMessageId, qc])
}

export function Timeline({
  me,
  conversationId,
  members,
  onReply,
  jumpToId,
  onJumpDone,
}: {
  me: UserDto
  conversationId: string
  members: UserDto[]
  onReply: (m: MessageDto) => void
  jumpToId?: string | null
  onJumpDone?: () => void
}) {
  const q = useInfiniteQuery(messagesQuery(conversationId))
  const listRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const memberNames = useMemo(() => members.map((u) => u.name), [members])
  // pages[0]=최신 청크, 각 청크 내부도 최신순 → 평탄화(전역 최신순) 후 역순 = 위가 과거
  const messages = useMemo(() => (q.data ? q.data.pages.flatMap((p) => p.items).reverse() : []), [q.data])
  const newest = messages[messages.length - 1]
  useAdvanceRead(conversationId, newest?.id)

  const jump = useJumpToMessage(q, onJumpDone)
  useEffect(() => {
    if (!jumpToId) return
    atBottomRef.current = false // 점프 중에는 하단 자동 추종을 끈다
    jump(jumpToId)
  }, [jumpToId, jump])

  useLayoutEffect(() => {
    const el = listRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages.length])

  // 과거 페이지가 커밋된 직후(페인트 전) 늘어난 높이만큼 내려 화면 위치를 유지한다.
  // fetchNextPage가 끝난 시점에는 아직 렌더 전(react-query 알림이 setTimeout 배치)이라
  // 거기서 보정하면 높이 차가 0으로 계산돼 무효다 — 실 Chrome에서 확인
  const olderRef = useRef<number | null>(null) // "이전 메시지 보기" 직전 scrollHeight
  const pageCount = q.data?.pages.length ?? 0
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el || olderRef.current === null) return
    el.scrollTop += el.scrollHeight - olderRef.current
    olderRef.current = null
  }, [pageCount])

  const onScroll = () => {
    const el = listRef.current
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const loadOlder = () => {
    olderRef.current = listRef.current?.scrollHeight ?? 0
    void q.fetchNextPage().then((r) => {
      if (r.isError) olderRef.current = null
    })
  }

  return (
    <div className="timeline" ref={listRef} onScroll={onScroll}>
      {q.isError && <ErrorNotice message="메시지를 불러오지 못했습니다." onRetry={() => void q.refetch()} />}
      {q.hasNextPage && (
        <button className="load-older" onClick={loadOlder} disabled={q.isFetchingNextPage}>
          이전 메시지 보기
        </button>
      )}
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          m={m}
          isMine={m.author.id === me.id}
          meId={me.id}
          memberNames={memberNames}
          onReply={onReply}
        />
      ))}
    </div>
  )
}
