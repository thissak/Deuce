export type PresenceStatus = 'online' | 'away' | 'offline'

interface Entry {
  sockets: number
  away: boolean
}

export class PresenceTracker {
  private readonly entries = new Map<string, Entry>()

  connect(userId: string): PresenceStatus | null {
    const cur = this.entries.get(userId)
    if (cur) {
      cur.sockets += 1
      return null
    }
    this.entries.set(userId, { sockets: 1, away: false })
    return 'online'
  }

  disconnect(userId: string): PresenceStatus | null {
    const cur = this.entries.get(userId)
    if (!cur) return null
    cur.sockets -= 1
    if (cur.sockets > 0) return null
    this.entries.delete(userId)
    return 'offline'
  }

  setAway(userId: string): PresenceStatus | null {
    const cur = this.entries.get(userId)
    if (!cur || cur.away) return null
    cur.away = true
    return 'away'
  }

  setActive(userId: string): PresenceStatus | null {
    const cur = this.entries.get(userId)
    if (!cur || !cur.away) return null
    cur.away = false
    return 'online'
  }

  snapshot(): Record<string, Exclude<PresenceStatus, 'offline'>> {
    const out: Record<string, 'online' | 'away'> = {}
    for (const [userId, e] of this.entries) out[userId] = e.away ? 'away' : 'online'
    return out
  }
}
