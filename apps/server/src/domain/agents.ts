import { createHash } from 'node:crypto'
import type { AgentConnection, Prisma } from '@prisma/client'
import type { AppConfig } from '../config.js'
import { prisma } from '../db.js'

export const hashAgentToken = (token: string) => createHash('sha256').update(token).digest('hex')
export type AgentIdentity = AgentConnection & { owner: { email: string; isAgent: boolean } }

export function isAgentActive(a: AgentIdentity, config: AppConfig): boolean {
  return !a.revokedAt && a.expiresAt > new Date() && !a.owner.isAgent && config.allowedEmails.includes(a.owner.email)
}

// ADR 014: 키는 연결한 방 하나에만 쓴다. 소유자가 아직 그 방의 사람 멤버여야 한다.
export function agentConversationWhere(a: AgentConnection & { conversationId: string }): Prisma.ConversationWhereInput {
  return {
    id: a.conversationId,
    AND: [
      { members: { some: { userId: a.ownerId, user: { isAgent: false } } } },
      { members: { some: { userId: a.userId } } },
    ],
  }
}

export async function authenticateAgent(authorization: string | undefined, config: AppConfig) {
  const token = authorization?.match(/^Bearer (deuce_[A-Za-z0-9_-]{43})$/)?.[1]
  if (!token) return null
  const a = await prisma.agentConnection.findUnique({ where: { tokenHash: hashAgentToken(token) }, include: { owner: true } })
  // 방 없는 개인 키(#18 이전 방식)는 모두 회수됐고 새로 발급하지 않는다.
  if (!a || !a.conversationId || !isAgentActive(a, config)) return null
  const room = { ...a, conversationId: a.conversationId }
  if (!await prisma.conversation.count({ where: agentConversationWhere(room) })) return null
  if (!a.lastConnectedAt || Date.now() - a.lastConnectedAt.getTime() > 30_000)
    await prisma.agentConnection.update({ where: { id: a.id }, data: { lastConnectedAt: new Date() } })
  return room
}
