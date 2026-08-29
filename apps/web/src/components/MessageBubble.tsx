import type { MessageDto } from '@deuce/shared'
import { formatTime } from '../lib/format'
import { renderBody } from '../lib/text'

export function MessageBubble({
  m,
  isMine,
  memberNames,
  onReply,
}: {
  m: MessageDto
  isMine: boolean
  memberNames: string[]
  onReply: (m: MessageDto) => void
}) {
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
          {m.deleted ? '삭제된 메시지입니다' : renderBody(m.body, memberNames)}
          {!m.deleted && (
            <div className="msg-actions">
              <button onClick={() => onReply(m)}>답장</button>
              {/* T7: 반응·수정·삭제·고정 */}
            </div>
          )}
        </div>
        {/* T7: reactions, T8: attachments */}
      </div>
    </div>
  )
}
