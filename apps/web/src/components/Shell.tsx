import type { UserDto } from '@deuce/shared'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { api } from '../api/http'
import { ActivityPage } from './ActivityPage'
import { ChatPage } from './ChatPage'
import { setDiagnostics } from '../diagnostics/recorder'

export function Shell({ me }: { me: UserDto }) {
  const [notifyAsked, setNotifyAsked] = useState(
    typeof Notification === 'undefined' || Notification.permission !== 'default',
  )
  const logout = useMutation({
    mutationFn: () => api('/auth/logout', { method: 'POST' }),
    // 전체 리로드가 소켓·캐시·세션 상태를 한 번에 정리한다
    onSettled: () => window.location.assign('/'),
  })
  return (
    <div className="shell">
      <nav className="appbar">
        <NavLink to="/activity" className="appbar-item">활동</NavLink>
        <NavLink to="/chat" className="appbar-item">채팅</NavLink>
        <div className="appbar-spacer" />
        <button className="appbar-item" onClick={() => setDiagnostics(true)}>진단</button>
        <div className="appbar-me" title={me.email}>
          <span className="avatar">{me.name.slice(0, 1)}</span>
        </div>
        <button className="appbar-item" onClick={() => logout.mutate()} disabled={logout.isPending}>
          로그아웃
        </button>
      </nav>
      <main className="shell-main">
        <div className="shell-col">
          {!notifyAsked && (
            <div className="notify-banner">
              새 메시지 알림을 받으시겠어요?
              <button
                className="btn-primary"
                onClick={() => {
                  void Notification.requestPermission().finally(() => setNotifyAsked(true))
                }}
              >
                알림 켜기
              </button>
              <button className="btn-plain" onClick={() => setNotifyAsked(true)}>나중에</button>
            </div>
          )}
          <Routes>
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route path="/chat" element={<ChatPage me={me} />} />
            <Route path="/chat/:conversationId" element={<ChatPage me={me} />} />
            <Route path="/activity" element={<ActivityPage />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
