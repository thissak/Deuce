import type { AgentKey } from '@deuce/shared'
import { useState } from 'react'

/** 키 원문은 화면에 출력하지 않고 이 컴포넌트가 열린 동안만 복사·파일 저장에 사용한다. */
export function AgentConnectionSetup({ connection }: { connection: AgentKey }) {
  const [copied, setCopied] = useState('')
  const [failed, setFailed] = useState(false)
  const mcpUrl = `${location.origin}/mcp`
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); setFailed(false) }
    catch { setFailed(true) }
  }
  return <div className="agent-connection-setup">
    <p>외부 AI 앱에는 처음 한 번 연결합니다. 연결 키는 지금만 저장할 수 있으며 90일간 유효합니다.</p>
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
    <details><summary>연결 파일 저장</summary>
      <button onClick={() => {
        const blob = new Blob([JSON.stringify({ baseUrl: location.origin, token: connection.token }, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob); const link = document.createElement('a')
        link.href = url; link.download = 'deuce-connection.json'; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}>AI 연결 파일 저장</button>
    </details>
    <p>새 AI 세션에서 “듀스 대화 목록을 확인해줘”라고 요청하세요. 설정과 파일에는 비밀 키가 있으므로 채팅에 공유하지 마세요.</p>
    {copied && <p role="status">{copied} 복사 완료</p>}
    {failed && <p role="alert">복사하지 못했습니다. 클립보드 권한을 확인하고 다시 눌러 주세요.</p>}
  </div>
}
