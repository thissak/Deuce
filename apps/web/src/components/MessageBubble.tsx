import { MessageDtoSchema, type MessageDto } from '@deuce/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError, apiJson } from '../api/http'
import { messagesKey } from '../api/queries'
import { formatTime } from '../lib/format'
import { hasMyReaction, REACTION_EMOJIS } from '../lib/messages'
import { renderBody } from '../lib/text'
import { replaceMessage, type MessagesData } from '../realtime/cache'

/** 액션 응답(MessageDto)을 캐시에 반영. 404면 사라진 메시지 — 타임라인 재조회(이월: 404 비대칭) */
function useMessageAction(conversationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (req: { method: string; path: string; body?: unknown }) => {
      const raw =
        req.body === undefined
          ? await api(req.path, { method: req.method })
          : await apiJson(req.method, req.path, req.body)
      return raw === undefined ? null : MessageDtoSchema.parse(raw)
    },
    onSuccess: (m) => {
      if (m) qc.setQueryData<MessagesData>(messagesKey(conversationId), (d) => replaceMessage(d, m))
      else void qc.invalidateQueries({ queryKey: messagesKey(conversationId) }) // DELETE 204 — 소켓이 마스킹 DTO를 보내주지만 안전망
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 404) {
        void qc.invalidateQueries({ queryKey: messagesKey(conversationId) })
      }
    },
  })
}

export function MessageBubble({
  m,
  isMine,
  meId,
  memberNames,
  onReply,
}: {
  m: MessageDto
  isMine: boolean
  meId: string
  memberNames: string[]
  onReply: (m: MessageDto) => void
}) {
  const action = useMessageAction(m.conversationId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const toggleReaction = (emoji: string) => {
    action.mutate(
      hasMyReaction(m, emoji, meId)
        ? { method: 'DELETE', path: `/api/messages/${m.id}/reactions/${encodeURIComponent(emoji)}` }
        : { method: 'PUT', path: `/api/messages/${m.id}/reactions`, body: { emoji } },
    )
  }

  const saveEdit = () => {
    if (draft.trim().length === 0) return
    action.mutate({ method: 'PATCH', path: `/api/messages/${m.id}`, body: { body: draft } })
    setEditing(false)
  }

  return (
    <div id={`msg-${m.id}`} className={`msg-row ${isMine ? 'mine' : ''}`}>
      {!isMine && <span className="avatar">{m.author.name.slice(0, 1)}</span>}
      <div className="msg-main">
        <div className="msg-meta">
          {!isMine && <span className="msg-author">{m.author.name}</span>}
          <span>{formatTime(m.createdAt)}</span>
          {m.editedAt && !m.deleted && <span className="edited-mark">(수정됨)</span>}
          {m.pinnedAt && !m.deleted && <span className="pin-mark">📌 고정됨</span>}
        </div>
        <div className={`bubble ${m.deleted ? 'deleted' : ''}`}>
          {m.replyTo && (
            <div className="quote">
              <span className="quote-author">{m.replyTo.authorName}</span>
              {m.replyTo.deleted ? '삭제된 메시지입니다' : m.replyTo.body}
            </div>
          )}
          {m.deleted ? (
            '삭제된 메시지입니다'
          ) : editing ? (
            <div>
              <textarea value={draft} maxLength={4000} onChange={(e) => setDraft(e.target.value)} rows={2} />
              <div className="dialog-actions">
                <button className="btn-plain" onClick={() => setEditing(false)}>
                  취소
                </button>
                <button className="btn-primary" onClick={saveEdit}>
                  저장
                </button>
              </div>
            </div>
          ) : (
            renderBody(m.body, memberNames)
          )}
          {!m.deleted && !editing && (
            <div className="msg-actions">
              {REACTION_EMOJIS.map((e) => (
                <button key={e} onClick={() => toggleReaction(e)}>
                  {e}
                </button>
              ))}
              <button onClick={() => onReply(m)}>답장</button>
              <button
                onClick={() =>
                  action.mutate({
                    method: m.pinnedAt ? 'DELETE' : 'PUT',
                    path: `/api/messages/${m.id}/pin`,
                  })
                }
              >
                {m.pinnedAt ? '고정 해제' : '고정'}
              </button>
              {isMine && (
                <button
                  onClick={() => {
                    setDraft(m.body)
                    setEditing(true)
                  }}
                >
                  수정
                </button>
              )}
              {isMine &&
                (confirmDelete ? (
                  <button
                    className="btn-danger"
                    onClick={() => action.mutate({ method: 'DELETE', path: `/api/messages/${m.id}` })}
                  >
                    정말 삭제
                  </button>
                ) : (
                  <button onClick={() => setConfirmDelete(true)}>삭제</button>
                ))}
            </div>
          )}
        </div>
        {!m.deleted && m.reactions.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                className={`reaction-chip ${r.userIds.includes(meId) ? 'mine' : ''}`}
                onClick={() => toggleReaction(r.emoji)}
              >
                {r.emoji} {r.userIds.length}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
