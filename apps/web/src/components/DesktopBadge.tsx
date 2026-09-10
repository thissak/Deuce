import type { ConversationSummary } from '@deuce/shared'
import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { conversationsQuery } from '../api/queries'

const totalUnread = (conversations: ConversationSummary[]) =>
  conversations.reduce((total, conversation) => total + conversation.unreadCount, 0)

export function DesktopBadge({ signedIn }: { signedIn: boolean }) {
  const setUnreadCount = window.deuceDesktop?.setUnreadCount
  const { data } = useQuery({ ...conversationsQuery, enabled: signedIn && !!setUnreadCount, select: totalUnread })
  const count = signedIn ? data ?? 0 : 0
  useEffect(() => { setUnreadCount?.(count) }, [setUnreadCount, count])
  useEffect(() => () => { setUnreadCount?.(0) }, [setUnreadCount])
  return null
}
