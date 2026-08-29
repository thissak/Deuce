import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { activityQuery } from '../api/queries'
import { formatTime, truncate } from '../lib/format'

export function ActivityPage() {
  const navigate = useNavigate()
  const { data: items = [] } = useQuery(activityQuery)
  return (
    <div className="activity-page">
      <h2>활동</h2>
      {items.length === 0 && <p className="empty-state">새 활동이 없습니다.</p>}
      <ul className="search-results">
        {items.map((it) => (
          <li key={`${it.kind}-${it.messageId}-${it.actor.id}-${it.emoji ?? ''}`}>
            <button
              className="result-row"
              onClick={() => navigate(`/chat/${it.conversationId}?m=${it.messageId}`)}
            >
              <span className="result-meta">
                <span>
                  {it.kind === 'mention'
                    ? `${it.actor.name}님이 회원님을 멘션했습니다`
                    : `${it.actor.name}님이 ${it.emoji ?? ''} 반응을 남겼습니다`}
                </span>
                <span>{formatTime(it.createdAt)}</span>
              </span>
              {truncate(it.body, 60)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
