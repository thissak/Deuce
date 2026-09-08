import type { QueryClient } from '@tanstack/react-query'
import { RT, RTC, type MessageDto, type PresenceSnapshot } from '@deuce/shared'
import { conversationKey, conversationsKey, messagesKey, presenceKey } from '../api/queries'
import { appendMessage, patchPresence, replaceMessage, type MessagesData } from './cache'
import type { AppSocket } from './socket'
import { errorType, record } from '../diagnostics/recorder'
import { DiagnosticEventSchema } from '@deuce/shared'

export function attachRealtime(
  socket: AppSocket,
  qc: QueryClient,
  meId: string,
  onMessageNew?: (m: MessageDto) => void, // T10: 웹 알림 훅
): () => void {
  const replace = (m: MessageDto) =>
    qc.setQueryData<MessagesData>(messagesKey(m.conversationId), (d) => replaceMessage(d, m))

  const onNew = (m: MessageDto) => {
    qc.setQueryData<MessagesData>(messagesKey(m.conversationId), (d) => appendMessage(d, m))
    void qc.invalidateQueries({ queryKey: conversationsKey })
    onMessageNew?.(m)
  }
  const onUpdated = (m: MessageDto) => {
    replace(m)
    // 고정/고정 해제도 이 이벤트로 온다 — 상세(고정 배너) 갱신
    void qc.invalidateQueries({ queryKey: conversationKey(m.conversationId) })
    // 마지막 메시지를 수정하면 목록 미리보기(lastMessage.body)도 바뀐다
    void qc.invalidateQueries({ queryKey: conversationsKey })
  }
  const onDeleted = (m: MessageDto) => {
    replace(m)
    void qc.invalidateQueries({ queryKey: conversationKey(m.conversationId) })
    void qc.invalidateQueries({ queryKey: conversationsKey })
  }
  const onRead = (p: { conversationId: string; userId: string; lastReadMessageId: string }) => {
    // 타 기기에서 내가 읽은 경우 배지 해소. 타인 읽음 표시는 REST 스냅샷이 없어 v1 제외(레저 기록)
    if (p.userId === meId) void qc.invalidateQueries({ queryKey: conversationsKey })
  }
  const onCreated = () => {
    // 멤버 재추가 시 중복 수신 가능 — invalidate는 멱등이라 무해 (이월 항목)
    void qc.invalidateQueries({ queryKey: conversationsKey })
  }
  const onConvoUpdated = (p: { conversationId: string }) => {
    void qc.invalidateQueries({ queryKey: conversationsKey })
    void qc.invalidateQueries({ queryKey: conversationKey(p.conversationId) })
  }
  const onRemoved = (p: { conversationId: string }) => {
    void qc.invalidateQueries({ queryKey: conversationsKey })
    qc.removeQueries({ queryKey: messagesKey(p.conversationId) })
    qc.removeQueries({ queryKey: conversationKey(p.conversationId) })
  }
  const onPresence = (p: Parameters<typeof patchPresence>[1]) => {
    // 스냅샷을 아직 못 받았으면 패치하지 않는다 — 한 명짜리 캐시가 생기면
    // presenceQuery가 그걸 완전한 스냅샷으로 오해한다
    if (qc.getQueryData(presenceKey) === undefined) return
    qc.setQueryData<PresenceSnapshot>(presenceKey, (map) => patchPresence(map, p))
  }
  const onConnect = () => {
    const name = socket.io?.engine?.transport?.name
    record('socket.connect', { transport: name === 'websocket' || name === 'polling' ? name : 'other' })
    // 룸 조인이 비동기라 접속 직후 이벤트 공백 가능 + 재접속 시 놓친 이벤트 — 전체 재동기화 (스펙 §5)
    void qc.invalidateQueries()
  }
  const onDisconnect = (reason: string) => record('socket.disconnect', {
    reason: DiagnosticEventSchema.shape.reason.safeParse(reason).success
      ? reason as 'io server disconnect' | 'io client disconnect' | 'ping timeout' | 'transport close' | 'transport error' : 'other',
  })
  const onError = (error: Error) => record('socket.error', { errorType: errorType(error) })
  const onReconnect = (count: number) => record('socket.reconnect', { count })
  const onEvent = (name: string, payload: unknown) => {
    const parsed = DiagnosticEventSchema.shape.socketEvent.safeParse(name)
    if (!parsed.success) return
    const id = typeof payload === 'object' && payload !== null && 'id' in payload ? payload.id : undefined
    record('socket.event', { socketEvent: parsed.data, ...(typeof id === 'string' ? { messageId: id } : {}) })
  }
  socket.on('disconnect', onDisconnect)
  socket.on('connect_error', onError)
  socket.io?.on('reconnect_attempt', onReconnect)
  socket.onAny?.(onEvent)

  socket.on(RT.messageNew, onNew)
  socket.on(RT.messageUpdated, onUpdated)
  socket.on(RT.messageDeleted, onDeleted)
  socket.on(RT.reactionChanged, replace)
  socket.on(RT.readAdvanced, onRead)
  socket.on(RT.conversationCreated, onCreated)
  socket.on(RT.conversationUpdated, onConvoUpdated)
  socket.on(RT.conversationRemoved, onRemoved)
  socket.on(RT.presenceChanged, onPresence)
  socket.on('connect', onConnect)

  return () => {
    socket.off('disconnect', onDisconnect)
    socket.off('connect_error', onError)
    socket.io?.off('reconnect_attempt', onReconnect)
    socket.offAny?.(onEvent)
    socket.off(RT.messageNew, onNew)
    socket.off(RT.messageUpdated, onUpdated)
    socket.off(RT.messageDeleted, onDeleted)
    socket.off(RT.reactionChanged, replace)
    socket.off(RT.readAdvanced, onRead)
    socket.off(RT.conversationCreated, onCreated)
    socket.off(RT.conversationUpdated, onConvoUpdated)
    socket.off(RT.conversationRemoved, onRemoved)
    socket.off(RT.presenceChanged, onPresence)
    socket.off('connect', onConnect)
  }
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
