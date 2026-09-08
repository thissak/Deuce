import { AgentDtoSchema, AgentKeySchema, type AgentScope } from '@deuce/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, apiJson } from '../api/http'
import { useEscapeKey } from '../lib/useEscapeKey'
import { AgentConnectionSetup } from './AgentConnectionSetup'
import { ErrorNotice } from './ErrorNotice'

export const myAgentsKey = ['my-agents'] as const
export const roomAgentsKey = (id: string) => ['agents', id] as const

export function MyAgentsSettings({ onClose, onConnected }: { onClose: () => void; onConnected?: (id: string) => void }) {
  useEscapeKey(onClose)
  const qc = useQueryClient()
  const [name, setName] = useState('내 AI')
  const [scope, setScope] = useState<AgentScope>('SELECTED')
  const agents = useQuery({ queryKey: myAgentsKey, queryFn: async () => AgentDtoSchema.array().parse(await api('/api/agents')), refetchInterval: 5000 })
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: myAgentsKey }), qc.invalidateQueries({ queryKey: ['agents'] }),
  ])
  const create = useMutation({ mutationFn: async () => AgentKeySchema.parse(await apiJson('POST', '/api/agents', { name, scope })), onSuccess: refresh, gcTime: 0 })
  const change = useMutation({ mutationFn: ({ id, scope }: { id: string; scope: AgentScope }) => apiJson('PATCH', `/api/agents/${id}`, { scope }), onSuccess: refresh })
  const selectDefault = useMutation({ mutationFn: (id: string) => apiJson('PATCH', `/api/agents/${id}`, { isDefault: true }), onSuccess: refresh })
  const revoke = useMutation({ mutationFn: (id: string) => api(`/api/agents/${id}`, { method: 'DELETE' }), onSuccess: async (_, id) => {
    if (create.data?.id === id) create.reset()
    await refresh()
  } })
  return <div className="dialog-backdrop" onClick={onClose}>
    <div className="dialog agent-settings" role="dialog" aria-modal="true" aria-label="내 에이전트 설정" onClick={(e) => e.stopPropagation()}>
      <h3>내 에이전트 설정</h3>
      <p>내 AI를 한 번 연결하고, 대화하다 필요할 때 초대하세요. 새 연결은 초대한 방에만 참여합니다.</p>
      <p>기존 ‘채널만’·‘모든 대화’ 연결은 기존 방과 새 방에 적용됩니다. ‘초대한 방만’으로 바꾸면 각 방에서 다시 초대해야 합니다.</p>
      <label>AI 이름<input value={name} maxLength={40} disabled={!!create.data || create.isPending} onChange={(e) => setName(e.target.value)} /></label>
      <fieldset disabled={!!create.data || create.isPending}>
        <legend>참여 범위</legend>
        <label><input type="radio" name="new-agent-scope" checked={scope === 'SELECTED'} onChange={() => setScope('SELECTED')} />초대한 방만 참여</label>
        <label><input type="radio" name="new-agent-scope" checked={scope === 'CHANNELS'} onChange={() => setScope('CHANNELS')} />채널만 참여</label>
        <label><input type="radio" name="new-agent-scope" checked={scope === 'ALL'} onChange={() => setScope('ALL')} />모든 대화 참여 (1:1·그룹·채널)</label>
      </fieldset>
      <button disabled={!name.trim() || create.isPending || !!create.data} onClick={() => create.mutate()}>에이전트 등록</button>
      {create.data && <>
        <AgentConnectionSetup key={create.data.id} connection={create.data} onConnected={() => { void refresh(); onConnected?.(create.data!.id) }} />
        <p role="status">{agents.data?.find(a => a.id === create.data?.id)?.lastConnectedAt ? 'AI가 서버에 접속한 것을 확인했습니다.' : '아직 AI의 접속을 확인하지 못했습니다.'}</p>
        <button onClick={() => {
          const a = agents.data?.find(a => a.id === create.data?.id)
          if (a?.lastConnectedAt) onConnected?.(a.id)
          create.reset()
        }}>연결 설정을 저장했습니다</button>
      </>}
      {agents.isPending && <p>에이전트를 불러오는 중입니다.</p>}
      {agents.isError && <ErrorNotice message="에이전트를 불러오지 못했습니다." onRetry={() => void agents.refetch()} />}
      {(create.isError || change.isError || revoke.isError || selectDefault.isError) && <ErrorNotice message="설정을 저장하지 못했습니다. 참여 상태를 확인하고 다시 시도해 주세요." />}
      <ul className="agent-list">{agents.data?.map((a) => {
        const inactive = a.revoked || new Date(a.expiresAt) <= new Date()
        return <li key={a.id} className="agent-row">
          <strong>{a.name}</strong>
          {a.isDefault && <span>기본 AI</span>}
          {!inactive && !a.conversationId && !a.isDefault && <button disabled={selectDefault.isPending} onClick={() => selectDefault.mutate(a.id)}>기본 AI로 선택</button>}
          <span>{a.revoked ? '연결 해제됨' : inactive ? '만료됨' : `등록됨 · ${new Date(a.expiresAt).toLocaleDateString()}까지`}</span>
          {a.conversationId ? <span>기존 방 전용 연결 · 다른 방에 참여하려면 개인 에이전트를 등록하세요.</span> : <label>참여 범위
            <select aria-label={`${a.name} 참여 범위`} value={a.scope} disabled={inactive || change.isPending || revoke.isPending} onChange={(e) => change.mutate({ id: a.id, scope: e.target.value as AgentScope })}>
              <option value="SELECTED">초대한 방만 참여</option><option value="CHANNELS">채널만 참여</option><option value="ALL">모든 대화 참여</option>
            </select>
          </label>}
          {!inactive && <button disabled={revoke.isPending || change.isPending} onClick={() => revoke.mutate(a.id)}>전체 연결 해제</button>}
        </li>
      })}</ul>
      <div className="dialog-actions"><button onClick={onClose}>닫기</button></div>
    </div>
  </div>
}
