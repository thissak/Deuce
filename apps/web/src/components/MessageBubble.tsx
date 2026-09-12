import { MessageDtoSchema, type MessageDto } from '@deuce/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError, apiJson } from '../api/http'
import { conversationKey, messagesKey } from '../api/queries'
import { formatBytes, formatTime, isImage } from '../lib/format'
import { hasMyReaction } from '../lib/messages'
import { FluentEmoji } from './FluentEmoji'
import { renderBody } from '../lib/text'
import { replaceMessage, type MessagesData } from '../realtime/cache'
import { ErrorNotice } from './ErrorNotice'
import { MessageActions } from './MessageActions'

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
    onSuccess: (m, req) => {
      if (req.path.endsWith('/pin')) void qc.invalidateQueries({ queryKey: conversationKey(conversationId) }) // 고정 배너 즉시 갱신
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
  const actionFailed = action.isError && !(action.error instanceof ApiError && action.error.status === 404)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({}) // 썸네일 로드 실패 시 파일 카드로 대체

  const toggleReaction = (emoji: string) => {
    action.mutate(
      hasMyReaction(m, emoji, meId)
        ? { method: 'DELETE', path: `/api/messages/${m.id}/reactions/${encodeURIComponent(emoji)}` }
        : { method: 'PUT', path: `/api/messages/${m.id}/reactions`, body: { emoji } },
    )
  }

  // 편집 닫기는 성공 후 — 실패하면 입력을 잃지 않고 다시 저장할 수 있어야 한다
  const saveEdit = () => {
    if (draft.trim().length === 0) return
    action.mutate(
      { method: 'PATCH', path: `/api/messages/${m.id}`, body: { body: draft } },
      { onSuccess: () => setEditing(false) },
    )
  }

  const startEdit = () => {
    action.reset() // 앞선 액션 실패 문구가 편집창에 남지 않도록
    setDraft(m.body)
    setEditing(true)
  }

  if (m.system) return <div id={`msg-${m.id}`} className="agent-system-message">{m.body}</div>

  return (
    <div id={`msg-${m.id}`} className={`msg-row ${isMine ? 'mine' : ''}`}>
      {!isMine && <span className="avatar">{m.author.name.slice(0, 1)}</span>}
      <div className="msg-main">
        <div className="msg-meta">
          {!isMine && <span className="msg-author">{m.author.name}</span>}
          {m.author.isAgent && <span className="agent-badge">AI</span>}
          <span>{formatTime(m.createdAt)}</span>
          {m.editedAt && !m.deleted && <span className="edited-mark">(수정됨)</span>}
          {m.pinnedAt && !m.deleted && <span className="pin-mark">📌 고정됨</span>}
        </div>
        <div className="msg-bubble-wrap">
          {!m.deleted && !editing && (
            <MessageActions
              isMine={isMine}
              isPinned={m.pinnedAt != null}
              onToggleReaction={toggleReaction}
              onReply={() => onReply(m)}
              onEdit={startEdit}
              onPin={() =>
                action.mutate({
                  method: m.pinnedAt ? 'DELETE' : 'PUT',
                  path: `/api/messages/${m.id}/pin`,
                })
              }
              onDelete={() => action.mutate({ method: 'DELETE', path: `/api/messages/${m.id}` })}
            />
          )}
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
                {action.isError && <ErrorNotice message="수정에 실패했습니다. 다시 시도해 주세요." />}
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
            {actionFailed && !editing && <ErrorNotice message="요청에 실패했습니다. 다시 시도해 주세요." />}
          </div>
        </div>
        {!m.deleted && m.attachments.length > 0 && (
          <div>
            {m.attachments.map((a) =>
              isImage(a.contentType) && !imgErrors[a.id] ? (
                <a key={a.id} className="attachment-image" href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
                  <img
                    src={`/api/attachments/${a.id}`}
                    alt={a.fileName}
                    loading="lazy"
                    onError={() => setImgErrors((e) => ({ ...e, [a.id]: true }))}
                  />
                  <span className="attachment-caption">
                    {a.fileName} <span className="size">{formatBytes(a.size)}</span>
                  </span>
                </a>
              ) : (
                <a key={a.id} className="attachment" href={`/api/attachments/${a.id}`}>
                  📎 {a.fileName} <span className="size">{formatBytes(a.size)}</span>
                </a>
              ),
            )}
          </div>
        )}
        {!m.deleted && m.reactions.length > 0 && (
          <div className="reactions">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                className={`reaction-chip ${r.userIds.includes(meId) ? 'mine' : ''}`}
                aria-label={`${r.emoji} ${r.userIds.length}`}
                onClick={() => toggleReaction(r.emoji)}
              >
                <FluentEmoji emoji={r.emoji} /> <span>{r.userIds.length}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
