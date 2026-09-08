import { createHash } from 'node:crypto'
import type { AgentConnection, Prisma } from '@prisma/client'
import type { AppConfig } from '../config.js'
import { prisma } from '../db.js'

export const hashAgentToken = (token: string) => createHash('sha256').update(token).digest('hex')
export type AgentIdentity = AgentConnection & { owner: { email: string; isAgent: boolean } }

export function isAgentActive(a: AgentIdentity, config: AppConfig): boolean {
  return !a.revokedAt && a.expiresAt > new Date() && !a.owner.isAgent && config.allowedEmails.includes(a.owner.email)
}

// 목록과 모든 읽기/쓰기 경로가 이 조건을 공유한다. 캐시나 방별 AI 멤버 복제는 없다.
export function agentConversationWhere(a: AgentConnection): Prisma.ConversationWhereInput {
  return {
    AND: [
      { members: { some: { userId: a.ownerId, user: { isAgent: false } } } },
      a.conversationId
        ? { id: a.conversationId, members: { some: { userId: a.userId } } }
        : { ...(a.scope === 'CHANNELS' ? { type: 'CHANNEL' as const } : {}),
            ...(a.scope === 'SELECTED' ? { agentGrants: { some: { agentId: a.id } } } : {}),
            agentExclusions: { none: { agentId: a.id } } },
    ],
  }
}

export async function authenticateAgent(authorization: string | undefined, config: AppConfig) {
  const token = authorization?.match(/^Bearer (deuce_[A-Za-z0-9_-]{43})$/)?.[1]
  if (!token) return null
  const a = await prisma.agentConnection.findUnique({ where: { tokenHash: hashAgentToken(token) }, include: { owner: true } })
  if (!a || !isAgentActive(a, config)) return null
  if (a.conversationId && !await prisma.conversation.count({ where: agentConversationWhere(a) })) return null
  if (!a.lastConnectedAt || Date.now() - a.lastConnectedAt.getTime() > 30_000)
    await prisma.agentConnection.update({ where: { id: a.id }, data: { lastConnectedAt: new Date() } })
  return a
}
