import { ConversationSummarySchema, type ConversationDetail, type UserDto } from '@deuce/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, apiJson } from '../api/http'
import { conversationKey, conversationsKey, usersQuery } from '../api/queries'
import { useEscapeKey } from '../lib/useEscapeKey'
import { ErrorNotice } from './ErrorNotice'
import { PresenceDot } from './PresenceDot'

export function GroupSettings({ me, detail, onClose }: { me: UserDto; detail: ConversationDetail; onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  useEscapeKey(onClose)
  const { data: users = [] } = useQuery(usersQuery)
  const [title, setTitle] = useState(detail.title ?? '')
  const memberIds = new Set(detail.members.map((u) => u.id))
  const addable = users.filter((u) => !memberIds.has(u.id))

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: conversationsKey })
    await qc.invalidateQueries({ queryKey: conversationKey(detail.id) })
  }

  const rename = useMutation({
    mutationFn: () => apiJson('PATCH', `/api/conversations/${detail.id}`, { title: title.trim() }).then((r) => ConversationSummarySchema.parse(r)),
    onSuccess: refresh,
  })
  const addMember = useMutation({
    mutationFn: (userId: string) =>
      apiJson('POST', `/api/conversations/${detail.id}/members`, { userIds: [userId] }).then((r) =>
        ConversationSummarySchema.parse(r),
      ),
    onSuccess: refresh,
  })
  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      api(`/api/conversations/${detail.id}/members/${userId}`, { method: 'DELETE' }).then((r) =>
        ConversationSummarySchema.parse(r),
      ),
    onSuccess: refresh,
  })
  const leave = useMutation({
    mutationFn: () => api(`/api/conversations/${detail.id}/members/me`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: conversationsKey })
      navigate('/chat')
    },
  })

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="그룹 설정" onClick={(e) => e.stopPropagation()}>
        <h3>그룹 설정</h3>
        <div className="composer-row">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} style={{ flex: 1 }} />
          <button className="btn-primary" disabled={title.trim().length === 0 || rename.isPending} onClick={() => rename.mutate()}>
            이름 변경
          </button>
        </div>
        <h3>멤버 {detail.members.length}명</h3>
        <ul className="user-list">
          {detail.members.map((u) => (
            <li key={u.id} className="user-row">
              <span className="avatar-wrap">
                <span className="avatar">{u.name.slice(0, 1)}</span>
                <PresenceDot userId={u.id} />
              </span>
              <span style={{ flex: 1 }}>{u.name}{u.id === me.id ? ' (나)' : ''}</span>
              {u.id !== me.id && (
                <button className="btn-plain" disabled={removeMember.isPending} onClick={() => removeMember.mutate(u.id)}>제거</button>
              )}
            </li>
          ))}
        </ul>
        {addable.length > 0 && (
          <>
            <h3>멤버 추가</h3>
            <ul className="user-list">
              {addable.map((u) => (
                <li key={u.id}>
                  <button className="user-row" disabled={addMember.isPending} onClick={() => addMember.mutate(u.id)}>
                    <span className="avatar">{u.name.slice(0, 1)}</span>
                    <span>{u.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {(rename.isError || addMember.isError || removeMember.isError || leave.isError) && (
          <ErrorNotice message="요청에 실패했습니다. 다시 시도해 주세요." />
        )}
        <div className="dialog-actions">
          <button className="btn-danger" disabled={leave.isPending} onClick={() => leave.mutate()}>나가기</button>
          <button className="btn-plain" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  )
}
