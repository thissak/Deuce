import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { ClientToServerEvents, ServerToClientEvents } from '@deuce/shared'
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
  const [socket] = useState(createSocket)
  useEffect(() => {
    attachRealtime(socket, qc, meId)
    const detachSignals = attachPresenceSignals(socket)
    socket.connect()
    return () => {
      detachSignals()
      socket.off()
      socket.disconnect()
    }
  }, [socket, qc, meId])
  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
}
