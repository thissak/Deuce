import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { checkProvider, connectRunner, type Provider } from '@deuce/agent-runner'

type Saved = { agentId: string; ownerId: string; provider: Provider; secret: string; origin: string }
export function desktopAgents(options: {
  directory: string; origin: string; currentUser: () => Promise<string | null>;
  encrypt: (value: string) => string; decrypt: (value: string) => string;
}) {
  const path = join(options.directory, 'ai-connections.json')
  let records: Saved[] = []
  try { const value = JSON.parse(readFileSync(path, 'utf8')); if (Array.isArray(value)) records = value } catch { /* First launch or unreadable local preferences. */ }
  const runners = new Map<string, ReturnType<typeof connectRunner>>()
  const pendingRunners = new Map<string, ReturnType<typeof connectRunner>>()
  const starting = new Set<string>()
  let generation = 0
  let activeOwner: string | null = null
  function stopAll() {
    generation++
    for (const runner of [...runners.values(), ...pendingRunners.values()]) runner.stop()
    runners.clear(); pendingRunners.clear()
  }
  async function connect(agentId: string, token: string, provider: Provider, save: boolean) {
    if (starting.has(agentId)) return { ok: false, error: 'CONNECTING' }
    starting.add(agentId)
    const version = generation
    let runner: ReturnType<typeof connectRunner> | undefined
    try {
      const ownerId = await options.currentUser()
      if (version !== generation) throw new Error('OWNER_CHANGED')
      if (!ownerId) { stopAll(); activeOwner = null; throw new Error('LOGIN_REQUIRED') }
      if (activeOwner && activeOwner !== ownerId) { stopAll(); activeOwner = ownerId; throw new Error('OWNER_CHANGED') }
      activeOwner = ownerId
      if (runners.has(agentId)) return { ok: true, persisted: records.some(r => r.agentId === agentId && r.ownerId === ownerId) }
      await checkProvider(provider)
      if (version !== generation) throw new Error('OWNER_CHANGED')
      runner = connectRunner({ baseUrl: options.origin, token, provider })
      pendingRunners.set(agentId, runner)
      const identity = await runner.start()
      if (identity.agentId !== agentId || identity.ownerId !== ownerId || version !== generation) throw new Error('OWNER_CHANGED')
      const confirmedOwner = await options.currentUser()
      if (confirmedOwner !== ownerId || version !== generation) throw new Error('OWNER_CHANGED')
      pendingRunners.delete(agentId)
      runners.set(agentId, runner)
      let persisted = !save
      if (save) {
        try {
          const secret = options.encrypt(token)
          const saved = [...records.filter(r => r.agentId !== agentId), { agentId, ownerId, provider, secret, origin: options.origin }]
          mkdirSync(options.directory, { recursive: true })
          writeFileSync(path + '.tmp', JSON.stringify(saved), { mode: 0o600 })
          renameSync(path + '.tmp', path)
          records = saved
          persisted = true
        } catch { /* Keep the current connection; never persist plaintext as fallback. */ }
      }
      return { ok: true, persisted }
    } catch { runner?.stop(); return { ok: false, error: 'AI_CONNECTION_FAILED' } }
    finally { starting.delete(agentId); pendingRunners.delete(agentId) }
  }
  return {
    stopAll,
    async connect(raw: unknown) {
      const p = raw as { agentId?: unknown; token?: unknown; provider?: unknown } | null
      if (!p || typeof p.agentId !== 'string' || typeof p.token !== 'string' || !['codex', 'claude'].includes(String(p.provider))) return { ok: false, error: 'INVALID_CONNECTION' }
      return connect(p.agentId, p.token, p.provider as Provider, true)
    },
    async restore() {
      const requestedGeneration = generation
      const ownerId = await options.currentUser()
      if (requestedGeneration !== generation) return
      if (activeOwner !== ownerId) stopAll()
      activeOwner = ownerId
      if (!ownerId) return
      const restoreGeneration = generation
      for (const record of records) {
        if (restoreGeneration !== generation) return
        if (record.ownerId !== ownerId || record.origin !== options.origin || !['codex', 'claude'].includes(record.provider)) continue
        try { await connect(record.agentId, options.decrypt(record.secret), record.provider, false) } catch { /* Invalid encrypted record: reconnect from settings. */ }
      }
    },
  }
}
