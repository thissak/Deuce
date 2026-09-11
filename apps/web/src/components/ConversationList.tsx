import type { ConversationDetail, ConversationSummary, UserDto } from '@deuce/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/http'
import { conversationKey, conversationsKey, conversationsQuery } from '../api/queries'
import { filterConversations, previewText, type ConvoFilter } from '../lib/conversations'
import { formatTime } from '../lib/format'
import { useEscapeKey } from '../lib/useEscapeKey'
import { ErrorNotice } from './ErrorNotice'
import { NewChatDialog } from './NewChatDialog'
import { PresenceDot } from './PresenceDot'
import { SearchBox } from './SearchBox'

type ContextMenuState = {
  conversation: ConversationSummary
  x: number
  y: number
}

const FILTERS: { value: ConvoFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'unread', label: '읽지 않음' },
  { value: 'chats', label: '대화' },
  { value: 'channels', label: '채널' },
]

export function ConversationList({ me, activeId }: { me: UserDto; activeId?: string }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: conversations = [] } = useQuery(conversationsQuery)
  const [filter, setFilter] = useState<ConvoFilter>('all')
  const [showNew, setShowNew] = useState(false)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [leaveTarget, setLeaveTarget] = useState<ConversationSummary | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuOpenerRef = useRef<HTMLElement | null>(null)
  const shown = filterConversations(conversations, filter)

  const mute = useMutation({
    mutationFn: (conversation: ConversationSummary) =>
      api(`/api/conversations/${conversation.id}/mute`, {
        method: conversation.mutedAt ? 'DELETE' : 'PUT',
      }),
    onSuccess: (_result, conversation) => {
      const mutedAt = conversation.mutedAt ? null : new Date().toISOString()
      qc.setQueryData<ConversationSummary[]>(conversationsKey, (current) =>
        current?.map((item) => item.id === conversation.id ? { ...item, mutedAt } : item),
      )
      qc.setQueryData<ConversationDetail>(conversationKey(conversation.id), (current) =>
        current ? { ...current, mutedAt } : current,
      )
    },
  })

  const leave = useMutation({
    mutationFn: (conversation: ConversationSummary) =>
      api(`/api/conversations/${conversation.id}/members/me`, { method: 'DELETE' }),
    onSuccess: (_result, conversation) => {
      qc.setQueryData<ConversationSummary[]>(conversationsKey, (current) =>
        current?.filter((item) => item.id !== conversation.id),
      )
      qc.removeQueries({ queryKey: conversationKey(conversation.id), exact: true })
      setLeaveTarget(null)
      if (activeId === conversation.id) navigate('/chat')
    },
  })

  useEscapeKey(() => {
    if (leaveTarget && !leave.isPending) setLeaveTarget(null)
  })

  useEffect(() => {
    if (!menu) return

    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null)
    }
    const closeForKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenu(null)
      menuOpenerRef.current?.focus()
    }
    const closeForViewport = () => setMenu(null)

    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeForKey)
    window.addEventListener('resize', closeForViewport)
    window.addEventListener('scroll', closeForViewport, true)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeForKey)
      window.removeEventListener('resize', closeForViewport)
      window.removeEventListener('scroll', closeForViewport, true)
    }
  }, [menu])

  const openMenu = (conversation: ConversationSummary, x: number, y: number, opener: HTMLElement) => {
    const width = 190
    const height = conversation.type === 'DM' ? 52 : 96
    menuOpenerRef.current = opener
    if (!mute.isPending) mute.reset()
    setMenu({
      conversation,
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    })
  }

  const openPointerMenu = (event: MouseEvent<HTMLElement>, conversation: ConversationSummary) => {
    event.preventDefault()
    const target = event.target as HTMLElement
    openMenu(conversation, event.clientX, event.clientY, target.closest('button') ?? event.currentTarget)
  }

  const openKeyboardMenu = (event: KeyboardEvent<HTMLElement>, conversation: ConversationSummary) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    openMenu(conversation, rect.left + 24, rect.top + 24, event.currentTarget)
  }

  const moveMenuFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .filter((item) => !item.disabled)
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Home') items[0]?.focus()
    else if (event.key === 'End') items.at(-1)?.focus()
    else if (event.key === 'ArrowDown') items[(current + 1) % items.length]?.focus()
    else items[(current <= 0 ? items.length : current) - 1]?.focus()
  }

  return (
    <aside className="list-panel">
      <div className="list-header">
        <h2>채팅</h2>
        <button className="btn-primary" onClick={() => setShowNew(true)}>새 채팅</button>
      </div>
      <div className="chips">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            className={`chip ${filter === item.value ? 'active' : ''}`}
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <SearchBox />
      {mute.isError && <ErrorNotice message="음소거 설정에 실패했습니다. 다시 시도해 주세요." />}
      <ul className="convo-list">
        {shown.map((c) => {
          const other = c.type === 'DM' ? c.members.find((u) => u.id !== me.id) : undefined
          return (
          <li
            key={c.id}
            className="convo-row"
            onContextMenu={(event) => openPointerMenu(event, c)}
          >
            <button
              className={`convo-item ${c.id === activeId ? 'active' : ''} ${c.unreadCount > 0 ? 'unread' : ''}`}
              onClick={() => navigate(`/chat/${c.id}`)}
              onKeyDown={(event) => openKeyboardMenu(event, c)}
            >
              <span className="avatar-wrap">
                <span className="avatar">{c.displayName.slice(0, 1)}</span>
                {other && <PresenceDot userId={other.id} />}
              </span>
              <span className="convo-body">
                <span className="convo-title">
                  <span>{c.type === 'CHANNEL' ? '# ' : ''}{c.displayName}</span>
                  {c.lastMessage && <span className="convo-time">{formatTime(c.lastMessage.createdAt)}</span>}
                </span>
                <span className="convo-preview">{previewText(c)}</span>
              </span>
              {c.mutedAt && <span className="muted-mark">🔕</span>}
              {c.unreadCount > 0 && <span className="badge">{c.unreadCount}</span>}
            </button>
            <button
              type="button"
              className="convo-more"
              aria-label={`${c.displayName} 메뉴`}
              aria-haspopup="menu"
              aria-expanded={menu?.conversation.id === c.id}
              onClick={(event) => {
                event.stopPropagation()
                const rect = event.currentTarget.getBoundingClientRect()
                openMenu(c, rect.right - 180, rect.bottom + 4, event.currentTarget)
              }}
              onKeyDown={(event) => openKeyboardMenu(event, c)}
            >
              ⋯
            </button>
          </li>
          )
        })}
        {shown.length === 0 && (
          <li className="convo-empty">
            {filter === 'channels' ? '참여 중인 채널이 없습니다.' : filter === 'chats' ? '대화가 없습니다.' : '표시할 대화가 없습니다.'}
          </li>
        )}
      </ul>
      {menu && (
        <div
          id="conversation-context-menu"
          ref={menuRef}
          className="convo-context-menu"
          role="menu"
          aria-label={`${menu.conversation.displayName} 메뉴`}
          style={{ left: menu.x, top: menu.y }}
          onKeyDown={moveMenuFocus}
        >
          <button
            type="button"
            role="menuitem"
            disabled={mute.isPending}
            onClick={() => {
              const conversation = menu.conversation
              setMenu(null)
              mute.mutate(conversation)
            }}
          >
            {menu.conversation.mutedAt ? '🔔 음소거 해제' : '🔕 음소거'}
          </button>
          {menu.conversation.type !== 'DM' && (
            <button
              type="button"
              role="menuitem"
              className="danger"
              onClick={() => {
                setLeaveTarget(menu.conversation)
                leave.reset()
                setMenu(null)
              }}
            >
              ↪ {menu.conversation.type === 'CHANNEL' ? '채널 나가기' : '대화 나가기'}
            </button>
          )}
        </div>
      )}
      {showNew && (
        <NewChatDialog
          me={me}
          onClose={(id) => {
            setShowNew(false)
            if (id) navigate(`/chat/${id}`)
          }}
        />
      )}
      {leaveTarget && (
        <div
          className="dialog-backdrop"
          onClick={() => { if (!leave.isPending) setLeaveTarget(null) }}
        >
          <div
            className="dialog convo-leave-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={leaveTarget.type === 'CHANNEL' ? '채널 나가기' : '대화 나가기'}
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{leaveTarget.type === 'CHANNEL' ? '채널에서 나갈까요?' : '대화에서 나갈까요?'}</h3>
            <p><strong>{leaveTarget.displayName}</strong>이 목록에서 사라집니다.</p>
            {leave.isError && <ErrorNotice message="나가기에 실패했습니다. 다시 시도해 주세요." />}
            <div className="dialog-actions">
              <button
                type="button"
                className="btn-plain"
                disabled={leave.isPending}
                onClick={() => setLeaveTarget(null)}
              >
                취소
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={leave.isPending}
                onClick={() => leave.mutate(leaveTarget)}
              >
                {leave.isPending ? '나가는 중…' : leaveTarget.type === 'CHANNEL' ? '채널 나가기' : '대화 나가기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
