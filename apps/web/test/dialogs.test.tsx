import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GroupSettings } from '../src/components/GroupSettings'
import { NewChatDialog } from '../src/components/NewChatDialog'

const me = { id: 'u1', email: 'a@example.com', name: 'A', avatarUrl: null }
const detail = {
  id: 'c1', type: 'GROUP' as const, title: '팀방', displayName: '팀방', members: [me],
  lastMessage: null, unreadCount: 0, mutedAt: null, pinnedMessage: null,
}

function qcp(ui: ReactNode) {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})))
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('다이얼로그 접근성', () => {
  it('새 채팅 다이얼로그는 role=dialog + 레이블 + Escape 닫기', () => {
    const onClose = vi.fn()
    qcp(<NewChatDialog me={me} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: '새 채팅' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('그룹 설정 다이얼로그는 role=dialog + 레이블 + Escape 닫기', () => {
    const onClose = vi.fn()
    qcp(<GroupSettings me={me} detail={detail} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: '그룹 설정' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})
