import { AgentDtoSchema, AgentRunSchema } from '@deuce/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, apiJson } from '../api/http'
import { MyAgentsSettings, roomAgentsKey, myAgentsKey } from './MyAgentsSettings'
import { AgentSettings } from './AgentSettings'
import { ErrorNotice } from './ErrorNotice'
import { useEscapeKey } from '../lib/useEscapeKey'

export const conversationAgentsQuery = (id: string) => ({ queryKey: roomAgentsKey(id),
  queryFn: async () => AgentDtoSchema.array().parse(await api(`/api/conversations/${id}/agents`)), refetchInterval: 5000 })

export function AgentInvite({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient()
  const agents = useQuery(conversationAgentsQuery(conversationId))
  const [settings, setSettings] = useState<'mine' | 'room' | null>(null)
  const [asking, setAsking] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [target, setTarget] = useState('')
  const [runId, setRunId] = useState('')
  useEscapeKey(() => setAsking(false))
  const active = (agents.data ?? []).filter(a => !a.revoked && new Date(a.expiresAt) > new Date())
  const mine = active.filter(a => a.editable && !a.conversationId)
  const preferred = mine.find(a => a.isDefault) ?? (mine.length === 1 ? mine[0] : undefined)
  const participating = active.filter(a => a.participating)
  const invite = useMutation({
    mutationFn: (id: string) => apiJson('PUT', `/api/conversations/${conversationId}/agents/${id}`, { excluded: false }),
    onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: roomAgentsKey(conversationId) }), qc.invalidateQueries({ queryKey: myAgentsKey })]) },
  })
  const request = useMutation({ mutationFn: ({ id, agentId, prompt }: { id: string; agentId: string; prompt: string }) =>
    apiJson('POST', `/api/conversations/${conversationId}/agents/${agentId}/requests`, { id, prompt }).then(v => AgentRunSchema.parse(v)),
    onSuccess: result => { setRunId(result.id); setPrompt('') }, retry: false,
  })
  const run = useQuery({ queryKey: ['agent-run', conversationId, runId], enabled: !!runId,
    queryFn: async () => AgentRunSchema.parse(await api(`/api/conversations/${conversationId}/agent-requests/${runId}`)),
    refetchInterval: query => query.state.data?.status === 'RUNNING' ? 1000 : false,
  })
  const waiting = request.isPending || run.data?.status === 'RUNNING'
  return <div className="agent-invite-controls">
    <div className="agent-invite-actions">
      <button className="btn-primary" disabled={agents.isPending || invite.isPending || agents.isError} onClick={() => {
        if (preferred?.participating) setSettings('room')
        else if (preferred?.scopeAllows) invite.mutate(preferred.id)
        else setSettings('mine')
      }}>{invite.isPending ? '초대 중…' : preferred?.participating ? '내 AI 참여 중' : 'AI 초대'}</button>
      {participating.length > 0 && <button className="btn-plain" onClick={() => { setTarget((participating.find(a => a.runtime === 'READY') ?? participating[0])!.id); setAsking(true) }}>AI에게 요청</button>}
      <button className="btn-plain" onClick={() => setSettings('room')}>AI 관리</button>
    </div>
    {preferred && !preferred.participating && <small>{preferred.name} · {preferred.scope === 'SELECTED' ? '이 방의 이전·이후 대화와 자료 공유' : '참여 범위 설정 적용'}</small>}
    {participating.length > 0 && <p className="agent-participants" role="status">{participating.map(a => `${a.name} (${a.ownerName}) · ${a.runtime === 'READY' ? '응답 가능' : a.runtime === 'BUSY' ? '답변 중' : '실행기 오프라인'}`).join(' / ')}</p>}
    {agents.isError && <ErrorNotice message="AI 목록을 불러오지 못했습니다." onRetry={() => void agents.refetch()} />}
    {invite.isError && <ErrorNotice message="초대하지 못했습니다. 참여 상태를 확인한 뒤 다시 시도해 주세요." />}
    {settings === 'room' && <AgentSettings conversationId={conversationId} onClose={() => setSettings(null)} />}
    {settings === 'mine' && <MyAgentsSettings onClose={() => setSettings(null)} onConnected={id => { setSettings(null); invite.mutate(id) }} />}
    {asking && <div className="dialog-backdrop" onClick={() => setAsking(false)}><form className="dialog agent-request-dialog" role="dialog" aria-modal="true" aria-label="AI에게 요청" onClick={e => e.stopPropagation()} onSubmit={e => {
      e.preventDefault(); if (!prompt.trim() || waiting) return
      setRunId('')
      const body = prompt.trim(), previous = request.isError ? request.variables : undefined
      const id = previous?.agentId === target && previous.prompt === body ? previous.id : crypto.randomUUID()
      request.mutate({ id, agentId: target, prompt: body })
    }}>
      <h3>AI에게 요청</h3><p>이 방의 최근 대화와 텍스트 자료를 바탕으로 함께 답합니다.</p>
      <label>참여 AI<select value={target} onChange={e => setTarget(e.target.value)} disabled={waiting}>{participating.map(a => <option key={a.id} value={a.id}>{a.name} · {a.ownerName}</option>)}</select></label>
      <label>요청 내용<textarea value={prompt} onChange={e => setPrompt(e.target.value)} maxLength={2000} rows={4} disabled={waiting} /></label>
      <button type="button" className="btn-plain" disabled={waiting || !!prompt} onClick={() => setPrompt('지금까지의 대화와 자료를 요약해 주세요.')}>지금까지 요약</button>
      <button type="submit" className="btn-primary" disabled={waiting || !prompt.trim() || participating.find(a => a.id === target)?.runtime !== 'READY'}>요청 보내기</button>
      {participating.find(a => a.id === target)?.runtime === 'OFFLINE' && <p>AI가 연결된 PC에서 듀스 앱 또는 실행기를 켜 주세요. 기존 MCP 연결은 외부 AI 앱에서 직접 요청할 수 있습니다.</p>}
      {request.isError && <ErrorNotice message="요청 결과를 확인하지 못했습니다. 같은 요청의 상태를 다시 확인할 수 있습니다." onRetry={() => request.variables && request.mutate(request.variables)} />}
      {waiting && <p role="status">AI가 답변 중입니다. 완료되면 이 대화에 표시됩니다.</p>}
      {run.data?.status === 'COMPLETED' && <p role="status">AI가 대화에 답했습니다.</p>}
      {run.data?.status === 'FAILED' && <p role="alert">AI 요청이 완료되지 않았습니다. 연결·참여 상태를 확인한 뒤 새로 요청해 주세요.</p>}
      {run.isError && <ErrorNotice message="요청 상태를 불러오지 못했습니다." onRetry={() => void run.refetch()} />}
      <button type="button" className="btn-plain" onClick={() => setAsking(false)}>닫기</button>
    </form></div>}
  </div>
}
