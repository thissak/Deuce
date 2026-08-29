import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/App'

// jsdom에서 SocketProvider가 localhost로 실제 폴링을 시도하므로 트랜스포트를 막는다
vi.mock('socket.io-client', () => ({
  io: () => ({ connect: vi.fn(), disconnect: vi.fn(), on: vi.fn(), off: vi.fn(), emit: vi.fn() }),
}))

function renderApp(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('App 인증 게이트', () => {
  it('401이면 로그인 화면을 보여준다', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } }),
    ))
    renderApp()
    expect(await screen.findByText('Google로 로그인')).toBeTruthy()
  })

  it('로그인돼 있으면 앱 바를 보여준다', async () => {
    const me = { id: 'u1', email: 'a@example.com', name: '김대욱', avatarUrl: null }
    vi.stubGlobal('fetch', vi.fn().mockImplementation((path: string) =>
      Promise.resolve(new Response(JSON.stringify(path === '/auth/me' ? me : []), { status: 200, headers: { 'content-type': 'application/json' } })),
    ))
    renderApp()
    expect(await screen.findByText('채팅')).toBeTruthy()
    expect(screen.getByText('활동')).toBeTruthy()
  })
})
