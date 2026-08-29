import type { PresenceSnapshot } from '@deuce/shared'
import { useQuery } from '@tanstack/react-query'
import { presenceQuery } from '../api/queries'

const LABEL = { online: '온라인', away: '자리 비움', offline: '오프라인' } as const

export function presenceOf(map: PresenceSnapshot | undefined, userId: string): keyof typeof LABEL {
  return map?.[userId] ?? 'offline'
}

export function PresenceDot({ userId }: { userId: string }) {
  const { data } = useQuery(presenceQuery)
  const status = presenceOf(data, userId)
  return <span className={`presence presence-${status}`} title={LABEL[status]} />
}
