import type { QueryClient } from '@tanstack/react-query'
import { RT, RTC, type MessageDto, type PresenceSnapshot } from '@deuce/shared'
import { conversationsKey, messagesKey } from '../api/queries'
import { appendMessage, patchPresence, replaceMessage, type MessagesData } from './cache'
import type { AppSocket } from './socket'

export function attachRealtime(
  socket: AppSocket,
  qc: QueryClient,
  meId: string,
  onMessageNew?: (m: MessageDto) => void, // T10: 웹 알림 훅
): void {
  const replace = (m: MessageDto) =>
    qc.setQueryData<MessagesData>(messagesKey(m.conversationId), (d) => replaceMessage(d, m))

  socket.on(RT.messageNew, (m) => {
    qc.setQueryData<MessagesData>(messagesKey(m.conversationId), (d) => appendMessage(d, m))
    void qc.invalidateQueries({ queryKey: conversationsKey })
    onMessageNew?.(m)
  })
  socket.on(RT.messageUpdated, (m) => {
    replace(m)
    // 고정/고정 해제도 이 이벤트로 온다 — 상세(고정 배너) 갱신
    void qc.invalidateQueries({ queryKey: ['conversation', m.conversationId] })
  })
  socket.on(RT.messageDeleted, (m) => {
    replace(m)
    void qc.invalidateQueries({ queryKey: ['conversation', m.conversationId] })
    void qc.invalidateQueries({ queryKey: conversationsKey })
  })
  socket.on(RT.reactionChanged, replace)
  socket.on(RT.readAdvanced, (p) => {
    // 타 기기에서 내가 읽은 경우 배지 해소. 타인 읽음 표시는 REST 스냅샷이 없어 v1 제외(레저 기록)
    if (p.userId === meId) void qc.invalidateQueries({ queryKey: conversationsKey })
  })
  socket.on(RT.conversationCreated, () => {
    // 멤버 재추가 시 중복 수신 가능 — invalidate는 멱등이라 무해 (이월 항목)
    void qc.invalidateQueries({ queryKey: conversationsKey })
  })
  socket.on(RT.conversationUpdated, (p) => {
    void qc.invalidateQueries({ queryKey: conversationsKey })
    void qc.invalidateQueries({ queryKey: ['conversation', p.conversationId] })
  })
  socket.on(RT.conversationRemoved, (p) => {
    void qc.invalidateQueries({ queryKey: conversationsKey })
    qc.removeQueries({ queryKey: messagesKey(p.conversationId) })
    qc.removeQueries({ queryKey: ['conversation', p.conversationId] })
  })
  socket.on(RT.presenceChanged, (p) => {
    qc.setQueryData<PresenceSnapshot>(['presence'], (map) => patchPresence(map, p))
  })
  socket.on('connect', () => {
    // 룸 조인이 비동기라 접속 직후 이벤트 공백 가능 + 재접속 시 놓친 이벤트 — 전체 재동기화 (스펙 §5)
    void qc.invalidateQueries()
  })
}

export function attachPresenceSignals(socket: AppSocket): () => void {
  const onVisibility = () => socket.emit(document.hidden ? RTC.presenceAway : RTC.presenceActive)
  const onFocus = () => socket.emit(RTC.presenceActive) // 포커스 복귀 자가 치유 (이월 항목)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', onFocus)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', onFocus)
  }
}
