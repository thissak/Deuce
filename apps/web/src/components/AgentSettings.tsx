import { AgentDtoSchema } from '@deuce/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, apiJson } from '../api/http'
import { useEscapeKey } from '../lib/useEscapeKey'
import { ErrorNotice } from './ErrorNotice'
import { MyAgentsSettings, roomAgentsKey } from './MyAgentsSettings'

export function AgentSettings({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [showMine, setShowMine] = useState(false)
  useEscapeKey(showMine ? () => setShowMine(false) : onClose)
  const qc = useQueryClient()
  const key = roomAgentsKey(conversationId)
  const base = `/api/conversations/${conversationId}/agents`
  const agents = useQuery({ queryKey: key, queryFn: async () => AgentDtoSchema.array().parse(await api(base)) })
  const change = useMutation({
    mutationFn: ({ id, excluded }: { id: string; excluded: boolean }) => apiJson('PUT', `${base}/${id}`, { excluded }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })
  const revoke = useMutation({ mutationFn: (id: string) => api(`${base}/${id}`, { method: 'DELETE' }), onSuccess: () => qc.invalidateQueries({ queryKey: key }) })
  if (showMine) return <MyAgentsSettings onClose={() => setShowMine(false)} />
  return <div className="dialog-backdrop" onClick={onClose}>
    <div className="dialog agent-settings" role="dialog" aria-modal="true" aria-label="AI 연결" onClick={(e) => e.stopPropagation()}>
      <h3>이 대화의 에이전트</h3>
      <p>참여 중인 AI는 이 방의 대화와 첨부를 읽고 자신의 이름으로 답할 수 있습니다. 외부 AI 앱에서 요청할 때 동작합니다.</p>
      <button onClick={() => setShowMine(true)}>내 에이전트 설정</button>
      {agents.isPending && <p>에이전트를 불러오는 중입니다.</p>}
      {agents.isError && <ErrorNotice message="연결 목록을 불러오지 못했습니다." onRetry={() => void agents.refetch()} />}
      {(change.isError || revoke.isError) && <ErrorNotice message="참여 설정을 저장하지 못했습니다. 다시 시도해 주세요." />}
      {agents.data?.length === 0 && <p>참여 중인 에이전트가 없습니다. 내 에이전트 설정에서 등록하세요.</p>}
      <ul className="agent-list">{agents.data?.map((a) => {
        const inactive = a.revoked || new Date(a.expiresAt) <= new Date()
        return <li className="agent-row" key={a.id}>
          <strong>{a.name}</strong><span>{a.ownerName}이 연결 · {a.participating ? '참여 중' : a.revoked ? '연결 해제됨' : inactive ? '만료됨' : '참여 안 함'}</span>
          {a.editable && !inactive && (a.conversationId
            ? <button disabled={revoke.isPending} onClick={() => revoke.mutate(a.id)}>연결 해제</button>
            : a.scopeAllows
              ? <button disabled={change.isPending} onClick={() => change.mutate({ id: a.id, excluded: !a.excluded })}>{a.excluded ? '참여시키기' : '이 대화에서 해제'}</button>
              : <span>채널만 참여하도록 설정되어 있습니다. 내 에이전트 설정에서 모든 대화 참여를 선택하세요.</span>)}
        </li>
      })}</ul>
      <div className="dialog-actions"><button onClick={onClose}>닫기</button></div>
    </div>
  </div>
}
