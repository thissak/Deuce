import type { MessageDto, UserDto } from '@deuce/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../api/http'
import { conversationDetailQuery, conversationKey, conversationsKey } from '../api/queries'
import { truncate } from '../lib/format'
import { Composer } from './Composer'
import { ErrorNotice } from './ErrorNotice'
import { GroupSettings } from './GroupSettings'
import { PresenceDot } from './PresenceDot'
import { SharedTab } from './SharedTab'
import { Timeline } from './Timeline'

export function ChatView({ me, conversationId }: { me: UserDto; conversationId: string }) {
  const qc = useQueryClient()
  const detail = useQuery(conversationDetailQuery(conversationId))
  const [tab, setTab] = useState<'chat' | 'shared'>('chat')
  const [replyTo, setReplyTo] = useState<MessageDto | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [params, setParams] = useSearchParams()
  const jumpToId = params.get('m')

  const mute = useMutation({
    mutationFn: () => api(`/api/conversations/${conversationId}/mute`, { method: detail.data?.mutedAt ? 'DELETE' : 'PUT' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: conversationsKey })
      await qc.invalidateQueries({ queryKey: conversationKey(conversationId) })
    },
  })

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
  const other = c.type === 'DM' ? c.members.find((u) => u.id !== me.id) : undefined
  return (
    <section className="chat-view">
      <header className="chat-header">
        <span className="avatar-wrap">
          <span className="avatar">{c.displayName.slice(0, 1)}</span>
          {other && <PresenceDot userId={other.id} />}
        </span>
        <h3>{c.displayName}</h3>
        <div className="chat-tabs">
          <button className={`chat-tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>채팅</button>
          <button className={`chat-tab ${tab === 'shared' ? 'active' : ''}`} onClick={() => setTab('shared')}>공유</button>
        </div>
        <div className="header-actions">
          <button
            className="icon-btn"
            title={c.mutedAt ? '음소거 해제' : '음소거'}
            onClick={() => mute.mutate()}
            disabled={mute.isPending}
          >
            {c.mutedAt ? '🔕' : '🔔'}
          </button>
          {c.type === 'GROUP' && (
            <button className="icon-btn" title="그룹 설정" onClick={() => setShowSettings(true)}>⚙️</button>
          )}
        </div>
      </header>
      {mute.isError && <ErrorNotice message="음소거 설정에 실패했습니다. 다시 시도해 주세요." />}
      {c.pinnedMessage && tab === 'chat' && (
        <button className="pin-banner" onClick={() => setParams({ m: c.pinnedMessage!.id })}>
          📌 {c.pinnedMessage.deleted ? '삭제된 메시지입니다' : truncate(c.pinnedMessage.body, 80)}
        </button>
      )}
      {tab === 'chat' ? (
        <>
          <Timeline
            me={me}
            conversationId={conversationId}
            members={c.members}
            onReply={setReplyTo}
            jumpToId={jumpToId}
            onJumpDone={() => setParams({}, { replace: true })}
          />
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
      {showSettings && <GroupSettings me={me} detail={c} onClose={() => setShowSettings(false)} />}
    </section>
  )
}
