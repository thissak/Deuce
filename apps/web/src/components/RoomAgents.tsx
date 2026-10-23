import { AgentKeySchema, RoomAgentSchema, type AgentKey } from '@deuce/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, apiJson } from '../api/http'
import { useEscapeKey } from '../lib/useEscapeKey'
import { ErrorNotice } from './ErrorNotice'

const roomAgentsKey = (conversationId: string) => ['room-agents', conversationId] as const

/** 이 방에 내 AI 세션(Claude Code·Codex)을 연결한다(ADR 014). 키 원문은 화면에 출력하지 않고 복사에만 쓴다. */
export function RoomAgents({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  useEscapeKey(onClose)
  const qc = useQueryClient()
  const key = roomAgentsKey(conversationId)
  const base = `/api/conversations/${conversationId}/agents`
  const [name, setName] = useState('')
  const [issued, setIssued] = useState<AgentKey | null>(null)
  const agents = useQuery({ queryKey: key, queryFn: async () => RoomAgentSchema.array().parse(await api(base)) })
  const create = useMutation({
    mutationFn: async () => AgentKeySchema.parse(await apiJson('POST', base, { name: name.trim() })),
    onSuccess: (k) => { setIssued(k); setName(''); void qc.invalidateQueries({ queryKey: key }) },
  })
  const revoke = useMutation({
    mutationFn: (id: string) => api(`${base}/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  })

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog room-agents" role="dialog" aria-modal="true" aria-label="AI 세션 연결" onClick={(e) => e.stopPropagation()}>
        <h3>AI 세션 연결</h3>
        <p>지금 쓰는 Claude Code나 Codex 세션을 이 방에 연결합니다. 연결한 세션은 이 방의 대화를 읽고 AI 이름으로 글을 쓸 수 있습니다. 방 멤버 모두에게 보입니다.</p>
        {agents.isError && <ErrorNotice message="연결 목록을 불러오지 못했습니다." onRetry={() => void agents.refetch()} />}
        {agents.data?.length === 0 && <p>연결된 AI 세션이 없습니다.</p>}
        <ul className="user-list">
          {agents.data?.map((a) => (
            <li key={a.id} className="user-row">
              <span className="avatar">{a.name.slice(0, 1)}</span>
              <span style={{ flex: 1 }}>
                {a.name} <span className="agent-badge">AI</span>
                <br /><small>{a.ownerName}님이 연결 · {a.lastConnectedAt ? `마지막 사용 ${new Date(a.lastConnectedAt).toLocaleString()}` : '아직 사용 전'}</small>
              </span>
              {a.editable && <button className="btn-plain" disabled={revoke.isPending} onClick={() => revoke.mutate(a.id)}>연결 해제</button>}
            </li>
          ))}
        </ul>
        {issued ? <AgentSetup agentKey={issued} /> : (
          <div className="composer-row">
            <input type="text" aria-label="AI 이름" placeholder="AI 이름 (예: Lexus Claude)" maxLength={40} value={name}
              onChange={(e) => setName(e.target.value)} style={{ flex: 1 }} />
            <button className="btn-primary" disabled={name.trim().length === 0 || create.isPending} onClick={() => create.mutate()}>연결</button>
          </div>
        )}
        {(create.isError || revoke.isError) && <ErrorNotice message="요청에 실패했습니다. 다시 시도해 주세요." />}
        <div className="dialog-actions"><button className="btn-plain" onClick={onClose}>닫기</button></div>
      </div>
    </div>
  )
}

function AgentSetup({ agentKey }: { agentKey: AgentKey }) {
  const [copied, setCopied] = useState('')
  const [failed, setFailed] = useState(false)
  const mcpUrl = `${location.origin}/mcp`
  const authorization = `Bearer ${agentKey.token}`
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); setFailed(false) } catch { setFailed(true) }
  }
  return (
    <div className="agent-setup">
      <p>연결 키를 만들었습니다. 이 창을 닫으면 다시 볼 수 없습니다(90일간 유효). 연결할 AI 세션의 프로젝트 폴더에서 아래 설정을 한 번 적용하세요.</p>
      <button className="btn-primary" onClick={() => void copy(
        `claude mcp add --transport http --scope local deuce ${mcpUrl} --header ${JSON.stringify(`Authorization: ${authorization}`)}`,
        'Claude Code 등록 명령')}>Claude Code 등록 명령 복사</button>
      <button className="btn-plain" onClick={() => void copy(
        `[mcp_servers.deuce]\nurl = ${JSON.stringify(mcpUrl)}\nhttp_headers = { Authorization = ${JSON.stringify(authorization)} }\n`,
        'Codex 설정')}>Codex 설정 복사</button>
      <p>Claude Code 명령은 실행한 프로젝트 폴더에만 등록됩니다. Codex 설정은 <code>~/.codex/config.toml</code>에 추가하며 이 PC의 모든 Codex 세션에 적용됩니다.</p>
      <p>적용한 뒤 그 세션에서 “듀스 방에 작업 결과 보내줘”처럼 요청하세요. 명령과 설정에는 비밀 키가 들어 있으니 채팅에 붙여 넣지 마세요.</p>
      {copied && <p role="status">{copied}을 복사했습니다.</p>}
      {failed && <p role="alert">복사하지 못했습니다. 클립보드 권한을 확인하고 다시 눌러 주세요.</p>}
    </div>
  )
}
