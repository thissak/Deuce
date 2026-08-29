import { MessageDtoSchema, type MessageDto, type UserDto } from '@deuce/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type KeyboardEvent } from 'react'
import { apiJson } from '../api/http'
import { messagesKey } from '../api/queries'
import { appendMessage, type MessagesData } from '../realtime/cache'

export function Composer({
  conversationId,
  replyTo,
  onClearReply,
}: {
  me: UserDto // T7: 멘션에서 사용
  conversationId: string
  members: UserDto[] // T7: 멘션 후보
  replyTo: MessageDto | null
  onClearReply: () => void
}) {
  const qc = useQueryClient()
  const [text, setText] = useState('')

  const send = useMutation({
    mutationFn: async () =>
      MessageDtoSchema.parse(
        await apiJson('POST', `/api/conversations/${conversationId}/messages`, {
          body: text,
          replyToId: replyTo?.id,
          mentions: [], // T7: collectMentionIds로 교체
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
      submit()
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
            value={text}
            maxLength={4000}
            placeholder="메시지를 입력하세요"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
          />
          {/* T7: 멘션 팝업 */}
        </div>
        <button className="send-btn" onClick={submit} disabled={text.trim().length === 0 || send.isPending}>
          보내기
        </button>
      </div>
    </div>
  )
}
