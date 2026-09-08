import type { AgentKey } from '@deuce/shared'
import { useState } from 'react'

/** 키 원문은 화면에 출력하지 않고 이 컴포넌트가 열린 동안만 복사·파일 저장에 사용한다. */
export function AgentConnectionSetup({ connection, onConnected }: { connection: AgentKey; onConnected?: () => void }) {
  const [copied, setCopied] = useState('')
  const [failed, setFailed] = useState(false)
  const [provider, setProvider] = useState<'codex' | 'claude'>('codex')
  const [connecting, setConnecting] = useState(false)
  const [connectionError, setConnectionError] = useState(false)
  const [sessionOnly, setSessionOnly] = useState(false)
  const mcpUrl = `${location.origin}/mcp`
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); setFailed(false) }
    catch { setFailed(true) }
  }
  return <div className="agent-connection-setup">
    <p>외부 AI 앱에는 처음 한 번 연결합니다. 연결 키는 지금만 저장할 수 있으며 90일간 유효합니다.</p>
    <label>사용할 AI<select value={provider} disabled={connecting} onChange={e => setProvider(e.target.value as 'codex' | 'claude')}><option value="codex">Codex</option><option value="claude">Claude Code</option></select></label>
    <p>초대한 방의 참여자가 AI에게 요청할 수 있습니다. 이 PC의 로그인된 AI 사용량을 사용하며, PC와 듀스 앱이 켜져 있어야 응답합니다.</p>
    {window.deuceDesktop?.connectAgent ? <>
      <button disabled={connecting} onClick={async () => {
        setConnecting(true); setConnectionError(false)
        try {
          const result = await window.deuceDesktop!.connectAgent!({ agentId: connection.id, token: connection.token, provider })
          if (!result.ok) { setConnectionError(true); return }
          setSessionOnly(!result.persisted)
          if (result.persisted) onConnected?.()
        } catch { setConnectionError(true) }
        finally { setConnecting(false) }
      }}>{connecting ? 'AI 연결 확인 중…' : '이 PC에서 연결'}</button>
      {connectionError && <p role="alert">연결하지 못했습니다. 선택한 AI의 CLI 설치·로그인을 확인해 주세요. 터미널에서 Codex는 <code>codex login</code>, Claude는 <code>claude auth login</code>으로 로그인합니다.</p>}
      {sessionOnly && <p role="status">이번 실행 동안 연결했습니다. 이 PC에서 암호화 저장을 사용할 수 없어 앱을 다시 켜면 재연결해야 합니다.</p>}
    </> : <>
      <p>데스크톱 앱에서는 ‘이 PC에서 연결’을 사용할 수 있습니다. 웹에서는 연결 파일을 저장한 뒤 PC에서 실행기를 한 번 시작하세요.</p>
      <code className="agent-runner-command">pnpm --filter @deuce/agent-runner start /연결파일경로/deuce-connection.json {provider}</code>
    </>}
    <details><summary>연결 파일 저장</summary>
      <button onClick={() => {
        const blob = new Blob([JSON.stringify({ baseUrl: location.origin, token: connection.token }, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob); const link = document.createElement('a')
        link.href = url; link.download = 'deuce-connection.json'; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}>AI 연결 파일 저장</button>
    </details>
    <details><summary>기존 MCP 방식으로 연결</summary>
    <label>MCP 서버 주소<input readOnly value={mcpUrl} /></label>
    <button onClick={() => void copy(mcpUrl, '서버 주소')}>주소 복사</button>
    <h4>Codex</h4>
    <p>설정을 복사해 이 컴퓨터의 <code>~/.codex/config.toml</code> 맨 아래에 추가하세요.</p>
    <button onClick={() => void copy(`[mcp_servers.deuce-${connection.id}]\nurl = ${JSON.stringify(mcpUrl)}\nhttp_headers = { Authorization = ${JSON.stringify(`Bearer ${connection.token}`)} }\n`, 'Codex 설정')}>Codex 설정 복사</button>
    <h4>Claude Code</h4>
    <p>등록 명령을 복사해 이 컴퓨터의 터미널에서 실행하세요.</p>
    <button onClick={() => {
      const config = JSON.stringify({ type: 'http', url: mcpUrl, headers: { Authorization: `Bearer ${connection.token}` } })
      const quoted = "'" + config.replaceAll("'", "'\"'\"'") + "'"
      void copy(`claude mcp add-json --scope user deuce-${connection.id} ${quoted}`, 'Claude Code 등록 명령')
    }}>Claude Code 등록 명령 복사</button>

    <p>새 AI 세션에서 “듀스 대화 목록을 확인해줘”라고 요청하세요. 설정과 파일에는 비밀 키가 있으므로 채팅에 공유하지 마세요.</p>
    {copied && <p role="status">{copied} 복사 완료</p>}
    {failed && <p role="alert">복사하지 못했습니다. 클립보드 권한을 확인하고 다시 눌러 주세요.</p>}
    </details>
  </div>
}
