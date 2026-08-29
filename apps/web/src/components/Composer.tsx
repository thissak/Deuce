import { MessageDtoSchema, type MessageDto, type UserDto } from '@deuce/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState, type KeyboardEvent } from 'react'
import { apiJson } from '../api/http'
import { messagesKey } from '../api/queries'
import { collectMentionIds, mentionQueryAt } from '../lib/mentions'
import { appendMessage, type MessagesData } from '../realtime/cache'

export function Composer({
  me,
  conversationId,
  members,
  replyTo,
  onClearReply,
}: {
  me: UserDto
  conversationId: string
  members: UserDto[]
  replyTo: MessageDto | null
  onClearReply: () => void
}) {
  const qc = useQueryClient()
  const [text, setText] = useState('')
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const candidates = mention
    ? members.filter((u) => u.id !== me.id && u.name.toLowerCase().startsWith(mention.query.toLowerCase()))
    : []

  const refreshMention = () => {
    const el = boxRef.current
    setMention(el ? mentionQueryAt(el.value, el.selectionStart) : null)
  }

  const pickMention = (name: string) => {
    if (!mention) return
    const el = boxRef.current!
    const caret = el.selectionStart
    setText(text.slice(0, mention.start) + `@${name} ` + text.slice(caret))
    setMention(null)
    el.focus()
  }

  const send = useMutation({
    mutationFn: async () =>
      MessageDtoSchema.parse(
        await apiJson('POST', `/api/conversations/${conversationId}/messages`, {
          body: text,
          replyToId: replyTo?.id,
          mentions: collectMentionIds(text, members),
        }),
      ),
    onSuccess: (m) => {
      qc.setQueryData<MessagesData>(messagesKey(conversationId), (d) => appendMessage(d, m))
      setText('')
      onClearReply()
    },
  })

  const submit = () => {
    if (text.trim().length === 0 || send.isPending) return
    send.mutate()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (candidates.length > 0) pickMention(candidates[0]!.name)
      else submit()
    }
  }

  return (
    <div className="composer">
      {send.isError && <div className="composer-error">전송에 실패했습니다. 다시 시도해 주세요.</div>}
      {replyTo && (
        <div className="reply-chip">
          <span className="quote-author">{replyTo.author.name}에게 답장</span>
          <span className="convo-preview">{replyTo.deleted ? '삭제된 메시지입니다' : replyTo.body}</span>
          <button className="chip-close" onClick={onClearReply}>
            ✕
          </button>
        </div>
      )}
      <div className="composer-row">
        <div className="composer-anchor">
          <textarea
            ref={boxRef}
            value={text}
            maxLength={4000}
            placeholder="메시지를 입력하세요"
            onChange={(e) => {
              setText(e.target.value)
              refreshMention()
            }}
            onKeyUp={refreshMention}
            onClick={refreshMention}
            onKeyDown={onKeyDown}
            rows={1}
          />
          {candidates.length > 0 && (
            <div className="mention-pop">
              {candidates.map((u) => (
                <button
                  key={u.id}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pickMention(u.name)
                  }}
                >
                  <span className="avatar">{u.name.slice(0, 1)}</span>
                  {u.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="send-btn" onClick={submit} disabled={text.trim().length === 0 || send.isPending}>
          보내기
        </button>
      </div>
    </div>
  )
}
