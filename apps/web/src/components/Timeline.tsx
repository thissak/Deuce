import type { MessageDto, UserDto } from '@deuce/shared'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { apiJson } from '../api/http'
import { conversationsKey, messagesQuery } from '../api/queries'
import { useJumpToMessage } from '../lib/useJumpToMessage'
import { ErrorNotice } from './ErrorNotice'
import { MessageBubble } from './MessageBubble'

/** 최신 메시지가 보이는 상태(탭 표시 중)일 때만 읽음 커서를 전진시킨다. 서버가 후퇴를 막아주므로 낙관 전송. */
function useAdvanceRead(conversationId: string, newestMessageId: string | undefined): void {
  const qc = useQueryClient()
  const sentRef = useRef<string | null>(null)
  useEffect(() => {
    const send = () => {
      if (!newestMessageId || document.hidden || sentRef.current === newestMessageId) return
      sentRef.current = newestMessageId
      apiJson('PUT', `/api/conversations/${conversationId}/read`, { messageId: newestMessageId })
        .then(() => qc.invalidateQueries({ queryKey: conversationsKey }))
        .catch(() => {
          sentRef.current = null // 실패 시 다음 기회에 재시도
        })
    }
    send()
    document.addEventListener('visibilitychange', send)
    return () => document.removeEventListener('visibilitychange', send)
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

  const onScroll = () => {
    const el = listRef.current
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const loadOlder = async () => {
    const el = listRef.current
    const prev = el?.scrollHeight ?? 0
    await q.fetchNextPage()
    requestAnimationFrame(() => {
      if (el) el.scrollTop += el.scrollHeight - prev // 위로 로드해도 화면 위치 유지
    })
  }

  return (
    <div className="timeline" ref={listRef} onScroll={onScroll}>
      {q.isError && <ErrorNotice message="메시지를 불러오지 못했습니다." onRetry={() => void q.refetch()} />}
      {q.hasNextPage && (
        <button className="load-older" onClick={() => void loadOlder()} disabled={q.isFetchingNextPage}>
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
