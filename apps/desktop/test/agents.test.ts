import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { desktopAgents } from '../src/agents'
import { checkProvider, connectRunner } from '@deuce/agent-runner'
vi.mock('@deuce/agent-runner', () => ({ checkProvider: vi.fn(), connectRunner: vi.fn() }))
const directories: string[] = []
afterEach(() => { for (const d of directories.splice(0)) rmSync(d, { recursive: true, force: true }); vi.resetAllMocks() })
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'deuce-desktop-test-')); directories.push(directory)
  let user: string | null = 'owner'
  const stop = vi.fn()
  vi.mocked(connectRunner).mockReturnValue({ start: async () => ({ agentId: 'ai', ownerId: 'owner' }), stop })
  const options = { directory, origin: 'https://deuce.example', currentUser: async () => user,
    encrypt: (_: string) => 'encrypted-by-os', decrypt: (_: string) => 'private-token' }
  return { options, stop, setUser: (value: string | null) => { user = value } }
}
it('암호화된 키만 저장하고 같은 계정에서 복구하며 계정 전환 시 실행기를 중단한다', async () => {
  const f = fixture(), agents = desktopAgents(f.options)
  expect(await agents.connect({ agentId: 'ai', token: 'private-token', provider: 'codex' })).toEqual({ ok: true, persisted: true })
  const path = join(f.options.directory, 'ai-connections.json')
  expect(readFileSync(path, 'utf8')).not.toContain('private-token')
  expect(statSync(path).mode & 0o777).toBe(0o600)
  agents.stopAll()
  const restored = desktopAgents(f.options)
  await restored.restore()
  expect(connectRunner).toHaveBeenCalledTimes(2)
  f.setUser('someone-else'); await restored.restore()
  expect(f.stop).toHaveBeenCalledTimes(2)
  expect(connectRunner).toHaveBeenCalledTimes(2)
})
it('암호화를 사용할 수 없으면 평문 파일 없이 이번 세션에서만 연결한다', async () => {
  const f = fixture(), agents = desktopAgents({ ...f.options, encrypt: () => { throw new Error('no keychain') } })
  expect(await agents.connect({ agentId: 'ai', token: 'private-token', provider: 'claude' })).toEqual({ ok: true, persisted: false })
  expect(existsSync(join(f.options.directory, 'ai-connections.json'))).toBe(false)
  expect(checkProvider).toHaveBeenCalledWith('claude')
  agents.stopAll()
})
it('연결 확인 중 로그아웃하면 뒤늦게 완료된 연결을 저장하거나 유지하지 않는다', async () => {
  const f = fixture(), agents = desktopAgents(f.options)
  let ready!: (identity: { agentId: string; ownerId: string }) => void
  vi.mocked(connectRunner).mockReturnValue({ start: () => new Promise(resolve => { ready = resolve }), stop: f.stop })
  const connecting = agents.connect({ agentId: 'ai', token: 'private-token', provider: 'codex' })
  await vi.waitFor(() => expect(ready).toBeTypeOf('function'))
  f.setUser(null); agents.stopAll(); ready({ agentId: 'ai', ownerId: 'owner' })
  expect(await connecting).toMatchObject({ ok: false })
  expect(f.stop).toHaveBeenCalled()
  expect(existsSync(join(f.options.directory, 'ai-connections.json'))).toBe(false)
})
it('마지막 계정 재확인 응답이 로그아웃 뒤 도착해도 즉시 중단하고 저장하지 않는다', async () => {
  const f = fixture()
  let confirm!: (user: string | null) => void
  let reads = 0
  const agents = desktopAgents({ ...f.options, currentUser: async () => {
    if (++reads === 1) return 'owner'
    return new Promise<string | null>(resolve => { confirm = resolve })
  } })
  const connecting = agents.connect({ agentId: 'ai', token: 'private-token', provider: 'codex' })
  await vi.waitFor(() => expect(confirm).toBeTypeOf('function'))
  agents.stopAll()
  expect(f.stop).toHaveBeenCalled() // Stop the socket before the stale HTTP response arrives.
  confirm('owner')
  expect(await connecting).toMatchObject({ ok: false })
  expect(existsSync(join(f.options.directory, 'ai-connections.json'))).toBe(false)
})
