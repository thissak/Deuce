import { useEffect, useState, useSyncExternalStore } from 'react'
import { useLocation } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { diagnosticRoute } from '@deuce/shared'
import { apiJson } from '../api/http'
import { clearDiagnostics, diagnosticsEnabled, record, setDiagnostics, snapshotDiagnostics, subscribeDiagnostics } from './recorder'

export function DiagnosticsPanel() {
  const enabled = useSyncExternalStore(subscribeDiagnostics, diagnosticsEnabled)
  const location = useLocation()
  const [downloaded, setDownloaded] = useState(false)
  const upload = useMutation({
    mutationFn: () => apiJson<{ reportId: string }>('POST', '/api/diagnostics', snapshotDiagnostics()),
  })
  useEffect(() => { record('navigation', { route: diagnosticRoute(location.pathname) }) }, [location.pathname, enabled])
  if (!enabled) return null
  return (
    <details open className="diagnostics-panel" data-diagnostics-panel aria-label="진단 기록">
      <summary>진단 기록 중</summary>
      <p>문제를 재현한 뒤 기록을 보내 주세요. 대화 내용과 입력값은 수집하지 않습니다.</p>
      <button disabled={upload.isPending} onClick={() => upload.mutate()}>서버로 보내기</button>
      <button onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(snapshotDiagnostics(), null, 2)], { type: 'application/json' }))
        const link = document.createElement('a')
        link.href = url; link.download = 'deuce-diagnostics.json'; link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        setDownloaded(true)
      }}>파일로 저장</button>
      <button onClick={() => { clearDiagnostics(); upload.reset(); setDownloaded(false) }}>기록 비우기</button>
      <button onClick={() => setDiagnostics(false)}>진단 끄기</button>
      {upload.data && <p role="status">접수 번호: <code>{upload.data.reportId}</code></p>}
      {upload.isError && <p role="alert">전송하지 못했습니다. 로그인 상태를 확인하거나 파일로 저장해 주세요.</p>}
      {downloaded && <p role="status">진단 파일을 저장했습니다.</p>}
    </details>
  )
}
