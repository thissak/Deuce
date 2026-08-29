import type { MessageDto, UserDto } from '@deuce/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../api/http'
import { conversationDetailQuery } from '../api/queries'
import { truncate } from '../lib/format'
import { Composer } from './Composer'
import { SharedTab } from './SharedTab'
import { Timeline } from './Timeline'

export function ChatView({ me, conversationId }: { me: UserDto; conversationId: string }) {
  const detail = useQuery(conversationDetailQuery(conversationId))
  const [tab, setTab] = useState<'chat' | 'shared'>('chat')
  const [replyTo, setReplyTo] = useState<MessageDto | null>(null)

  if (detail.error instanceof ApiError && detail.error.status === 403) {
    return (
      <section className="chat-view">
        <div className="chat-error">
          <p>이 대화방에 접근할 수 없습니다.</p>
          <Link to="/chat">채팅 목록으로 돌아가기</Link>
        </div>
      </section>
    )
  }
  if (!detail.data) return <section className="chat-view" />

  const c = detail.data
  return (
    <section className="chat-view">
      <header className="chat-header">
        <span className="avatar">{c.displayName.slice(0, 1)}</span>
        <h3>{c.displayName}</h3>
        <div className="chat-tabs">
          <button className={`chat-tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>채팅</button>
          <button className={`chat-tab ${tab === 'shared' ? 'active' : ''}`} onClick={() => setTab('shared')}>공유</button>
        </div>
        <div className="header-actions">{/* T9: 음소거·그룹 설정 */}</div>
      </header>
      {c.pinnedMessage && tab === 'chat' && (
        <button
          className="pin-banner"
          onClick={() => document.getElementById(`msg-${c.pinnedMessage!.id}`)?.scrollIntoView({ block: 'center' })}
        >
          📌 {c.pinnedMessage.deleted ? '삭제된 메시지입니다' : truncate(c.pinnedMessage.body, 80)}
        </button>
      )}
      {tab === 'chat' ? (
        <>
          <Timeline me={me} conversationId={conversationId} members={c.members} onReply={setReplyTo} />
          <Composer
            me={me}
            conversationId={conversationId}
            members={c.members}
            replyTo={replyTo}
            onClearReply={() => setReplyTo(null)}
          />
        </>
      ) : (
        <SharedTab conversationId={conversationId} />
      )}
    </section>
  )
}
