import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, apiJson } from '../api/http'
import { conversationKey, conversationsKey } from '../api/queries'
import { useEscapeKey } from '../lib/useEscapeKey'

const AgentSchema = z.object({ id: z.string(), name: z.string(), ownerName: z.string(), expiresAt: z.string(), revoked: z.boolean() })
const KeySchema = z.object({ id: z.string(), token: z.string(), expiresAt: z.string() })
export function AgentSettings({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  useEscapeKey(onClose)
  const qc = useQueryClient()
  const [name, setName] = useState('내 AI')
  const [copied, setCopied] = useState('')
  const [copyFailed, setCopyFailed] = useState(false)
  const mcpUrl = `${location.origin}/mcp`
  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setCopied(label); setCopyFailed(false) }
    catch { setCopied(''); setCopyFailed(true) }
  }
  const key = ['agents', conversationId]
  const base = `/api/conversations/${conversationId}/agents`
  const agents = useQuery({ queryKey: key, queryFn: async () => z.array(AgentSchema).parse(await api(base)) })
  const refresh = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: conversationKey(conversationId) }), qc.invalidateQueries({ queryKey: conversationsKey })])
  }
  const create = useMutation({ mutationFn: async () => KeySchema.parse(await apiJson('POST', base, { name })), onSuccess: refresh, gcTime: 0 })
  const revoke = useMutation({ mutationFn: (id: string) => api(`${base}/${id}`, { method: 'DELETE' }), onSuccess: async (_, id) => { if (create.data?.id === id) create.reset(); await refresh() } })
  return <div className="dialog-backdrop" onClick={onClose}>
    <div className="dialog agent-settings" role="dialog" aria-modal="true" aria-label="AI 연결" onClick={(e) => e.stopPropagation()}>
      <h3>채널에 AI 연결</h3>
      <p>Codex·Claude Code 등 MCP를 지원하는 AI가 이 채널의 대화와 첨부를 읽고, 자신의 이름으로 메시지를 보낼 수 있습니다.</p>
      <p>듀스 MCP는 서버에서 실행됩니다. 프로젝트 다운로드나 Node.js 설치 없이 연결할 수 있습니다.</p>
      <label>MCP 서버 주소<input readOnly value={mcpUrl} onFocus={(e) => e.target.select()} /></label>
      <button onClick={() => void copy(mcpUrl, '서버 주소')}>주소 복사</button>
      <label>AI 이름<input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
      <button disabled={!name.trim() || create.isPending || !!create.data} onClick={() => create.mutate()}>연결 키 만들기</button>
      {create.data && <div role="status">
        <p>연결 키는 지금만 저장할 수 있습니다. 유효기간 90일이며 연결 해제로 회수할 수 있습니다.</p>
        <h4>Codex</h4>
        <p>아래 설정을 복사해 내 컴퓨터의 <code>~/.codex/config.toml</code> 맨 아래에 추가하세요. 기존 내용은 유지하세요.</p>
        <button onClick={() => void copy(`[mcp_servers.deuce-${create.data!.id}]\nurl = ${JSON.stringify(mcpUrl)}\nhttp_headers = { Authorization = ${JSON.stringify(`Bearer ${create.data!.token}`)} }\n`, 'Codex 설정')}>Codex 설정 복사</button>
        <h4>Claude Code</h4>
        <p>등록 명령을 복사해 Claude Code가 설치된 컴퓨터의 터미널에서 실행하세요. 이 컴퓨터의 모든 프로젝트에서 사용할 수 있습니다.</p>
        <button onClick={() => {
          const config = JSON.stringify({ type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${create.data!.token}` } })
          const quoted = "'" + config.replaceAll("'", "'\"'\"'") + "'"
          void copy(`claude mcp add-json --scope user deuce-${create.data!.id} ${quoted}`, 'Claude Code 등록 명령')
        }}>Claude Code 등록 명령 복사</button>
        <p>복사한 설정·명령에는 비밀 키가 들어 있습니다. 채팅이나 Git에 공유하지 마세요. 새 AI 세션을 열고 “듀스 채널을 읽어줘”라고 요청하세요.</p>
        <details><summary>다른 MCP 앱 / 기존 로컬 연결</summary>
        <p>Streamable HTTP 주소와 Authorization 헤더를 지원하는 앱에서 연결할 수 있습니다. 인증 값은 아래 버튼으로 복사하세요.</p>
        <button onClick={() => void copy(`Bearer ${create.data!.token}`, 'Authorization 값')}>Authorization 값 복사</button>
        <button onClick={() => {
          const blob = new Blob([JSON.stringify({ baseUrl: location.origin, token: create.data!.token }, null, 2)], { type: 'application/json' })
          const url = URL.createObjectURL(blob); const link = document.createElement('a')
          link.href = url; link.download = 'deuce-connection.json'; link.click()
          setTimeout(() => URL.revokeObjectURL(url), 1000)
        }}>AI 연결 파일 저장</button>
        <p>저장 파일은 기존 로컬 연결 도구와도 호환됩니다.</p>
        </details>
      </div>}
      {copied && <p role="status">{copied} 복사 완료</p>}
      {copyFailed && <p role="alert">복사하지 못했습니다. 브라우저의 클립보드 권한을 확인하고 다시 눌러 주세요.</p>}
      <p>이미 발급한 키는 다시 표시되지 않습니다. 키를 잃었다면 해당 연결을 해제하고 새로 만드세요. AI는 요청할 때 동작하며 자동 응답하지 않습니다.</p>
      {agents.isPending && <p>연결 목록을 불러오는 중입니다.</p>}
      <ul className="user-list">{agents.data?.map((a) => <li className="user-row" key={a.id}>
        <span>{a.name} · {a.ownerName} 연결 {a.revoked ? '(해제됨)' : new Date(a.expiresAt) <= new Date() ? '(만료됨)' : ''}</span>
        {!a.revoked && <button disabled={revoke.isPending} onClick={() => revoke.mutate(a.id)}>연결 해제</button>}
      </li>)}</ul>
      {(agents.isError || create.isError || revoke.isError) && <p role="alert">요청하지 못했습니다. 채널 참여 상태를 확인하고 다시 시도해 주세요.</p>}
      <div className="dialog-actions"><button onClick={onClose}>닫기</button></div>
    </div>
  </div>
}
