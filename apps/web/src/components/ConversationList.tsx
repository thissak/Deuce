import type { UserDto } from '@deuce/shared'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { conversationsQuery } from '../api/queries'
import { filterConversations, previewText, type ConvoFilter } from '../lib/conversations'
import { formatTime } from '../lib/format'
import { NewChatDialog } from './NewChatDialog'
import { PresenceDot } from './PresenceDot'
import { SearchBox } from './SearchBox'

export function ConversationList({ me, activeId }: { me: UserDto; activeId?: string }) {
  const navigate = useNavigate()
  const { data: conversations = [] } = useQuery(conversationsQuery)
  const [filter, setFilter] = useState<ConvoFilter>('all')
  const [showNew, setShowNew] = useState(false)
  const shown = filterConversations(conversations, filter)

  return (
    <aside className="list-panel">
      <div className="list-header">
        <h2>채팅</h2>
        <button className="btn-primary" onClick={() => setShowNew(true)}>새 채팅</button>
      </div>
      <div className="chips">
        <button className={`chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>전체</button>
        <button className={`chip ${filter === 'unread' ? 'active' : ''}`} onClick={() => setFilter('unread')}>읽지 않음</button>
      </div>
      <SearchBox />
      <ul className="convo-list">
        {shown.map((c) => {
          const other = c.type === 'DM' ? c.members.find((u) => u.id !== me.id) : undefined
          return (
          <li key={c.id}>
            <button
              className={`convo-item ${c.id === activeId ? 'active' : ''} ${c.unreadCount > 0 ? 'unread' : ''}`}
              onClick={() => navigate(`/chat/${c.id}`)}
            >
              <span className="avatar-wrap">
                <span className="avatar">{c.displayName.slice(0, 1)}</span>
                {other && <PresenceDot userId={other.id} />}
              </span>
              <span className="convo-body">
                <span className="convo-title">
                  <span>{c.displayName}</span>
                  {c.lastMessage && <span className="convo-time">{formatTime(c.lastMessage.createdAt)}</span>}
                </span>
                <span className="convo-preview">{previewText(c)}</span>
              </span>
              {c.mutedAt && <span className="muted-mark">🔕</span>}
              {c.unreadCount > 0 && <span className="badge">{c.unreadCount}</span>}
            </button>
          </li>
          )
        })}
      </ul>
      {showNew && (
        <NewChatDialog
          me={me}
          onClose={(id) => {
            setShowNew(false)
            if (id) navigate(`/chat/${id}`)
          }}
        />
      )}
    </aside>
  )
}
