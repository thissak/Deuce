import { ConversationSummarySchema, type UserDto } from '@deuce/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiJson } from '../api/http'
import { conversationsKey, usersQuery } from '../api/queries'

export function NewChatDialog({ me, onClose }: { me: UserDto; onClose: (conversationId?: string) => void }) {
  const qc = useQueryClient()
  const { data: users = [] } = useQuery(usersQuery)
  const [selected, setSelected] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const candidates = users.filter((u) => u.id !== me.id)
  const isGroup = selected.length > 1 || title.trim().length > 0

  const create = useMutation({
    mutationFn: async () => {
      const payload = isGroup
        ? { type: 'group', title: title.trim(), memberIds: selected }
        : { type: 'dm', otherUserId: selected[0] }
      return ConversationSummarySchema.parse(await apiJson('POST', '/api/conversations', payload))
    },
    onSuccess: async (c) => {
      await qc.invalidateQueries({ queryKey: conversationsKey })
      onClose(c.id)
    },
  })

  const disabled =
    create.isPending || selected.length === 0 || (isGroup && title.trim().length === 0)

  return (
    <div className="dialog-backdrop" onClick={() => onClose()}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3>새 채팅</h3>
        <input
          type="text"
          placeholder="그룹 이름 (두 명 이상이면 필수)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <ul className="user-list">
          {candidates.map((u) => (
            <li key={u.id}>
              <button
                className={`user-row ${selected.includes(u.id) ? 'selected' : ''}`}
                onClick={() =>
                  setSelected((s) => (s.includes(u.id) ? s.filter((x) => x !== u.id) : [...s, u.id]))
                }
              >
                <span className="avatar">{u.name.slice(0, 1)}</span>
                <span>{u.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {create.isError && <div className="composer-error">만들지 못했습니다. 다시 시도해 주세요.</div>}
        <div className="dialog-actions">
          <button className="btn-plain" onClick={() => onClose()}>취소</button>
          <button className="btn-primary" disabled={disabled} onClick={() => create.mutate()}>시작</button>
        </div>
      </div>
    </div>
  )
}
