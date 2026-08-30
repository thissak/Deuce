import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@deuce/shared'
import { maybeNotify } from '../lib/notify'
import { attachPresenceSignals, attachRealtime } from './wiring'

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

export function createSocket(): AppSocket {
  // URL 생략 → same-origin(:5173) → Vite 프록시가 /socket.io를 :4000으로 넘긴다 (쿠키 자동 동봉)
  return io({ autoConnect: false })
}

const SocketContext = createContext<AppSocket | null>(null)

export function useSocket(): AppSocket {
  const s = useContext(SocketContext)
  if (!s) throw new Error('SocketProvider 밖에서 useSocket을 호출했습니다')
  return s
}

export function SocketProvider({ meId, children }: { meId: string; children: ReactNode }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  // useNavigate는 경로가 바뀔 때마다 새 함수를 준다. 의존성에 그대로 넣으면
  // 방을 옮길 때마다 소켓이 끊겼다 붙어(재구독·전체 invalidate) ref로 최신값만 읽는다
  const navigateRef = useRef(navigate)
  useEffect(() => {
    navigateRef.current = navigate
  })
  const [socket] = useState(createSocket)
  useEffect(() => {
    const detachRealtime = attachRealtime(socket, qc, meId, (m) =>
      maybeNotify(qc, meId, m, (id) => navigateRef.current(`/chat/${id}`)),
    )
    const detachSignals = attachPresenceSignals(socket)
    socket.connect()
    return () => {
      detachSignals()
      detachRealtime() // socket.off() 전체 해제 대신 붙인 것만 뗀다
      socket.disconnect()
    }
  }, [socket, qc, meId])
  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
}
