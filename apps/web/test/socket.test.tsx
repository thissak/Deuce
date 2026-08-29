import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { SocketProvider } from '../src/realtime/socket'

const connect = vi.fn()
const disconnect = vi.fn()
vi.mock('socket.io-client', () => ({
  io: () => ({ connect, disconnect, on: vi.fn(), off: vi.fn(), emit: vi.fn() }),
}))

function Nav() {
  const navigate = useNavigate()
  return <button onClick={() => navigate('/chat/c9')}>이동</button>
}

describe('SocketProvider', () => {
  it('방을 옮겨도 소켓을 다시 연결하지 않는다 (useNavigate 참조 불안정 대응)', () => {
    const qc = new QueryClient()
    const { getByText } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/chat/c1']}>
          <SocketProvider meId="u1">
            <Nav />
          </SocketProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(connect).toHaveBeenCalledTimes(1)
    act(() => getByText('이동').click())
    expect(connect).toHaveBeenCalledTimes(1)
    expect(disconnect).not.toHaveBeenCalled()
  })
})
