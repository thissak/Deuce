import type { ConversationSummary } from '@deuce/shared'
import { prisma } from '../db.js'
import { toUserDto } from '../serializers.js'

export async function isMember(conversationId: string, userId: string): Promise<boolean> {
  const m = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  })
  return m !== null
}

// 수십 명 규모 전제의 대화방별 개별 쿼리 — 조기 최적화 금지 (Global Constraints)
export async function summarizeConversation(conversationId: string, meId: string): Promise<ConversationSummary> {
  const convo = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { members: { include: { user: true } } },
  })
  const last = await prisma.message.findFirst({
    where: { conversationId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    include: { author: true },
  })
  const read = await prisma.readState.findUnique({
    where: { userId_conversationId: { userId: meId, conversationId } },
  })
  let lastReadAt: Date | null = null
  if (read?.lastReadMessageId) {
    const lr = await prisma.message.findUnique({ where: { id: read.lastReadMessageId } })
    lastReadAt = lr?.createdAt ?? null
  }
  const meMember = convo.members.find((m) => m.userId === meId)
  const baseline = lastReadAt ?? meMember?.joinedAt ?? null
  const unreadCount = await prisma.message.count({
    where: {
      conversationId,
      deletedAt: null,
      authorId: { not: meId },
      ...(baseline ? { createdAt: { gt: baseline } } : {}),
    },
  })
  const others = convo.members.filter((m) => m.userId !== meId)
  const displayName =
    convo.type === 'GROUP' ? (convo.title ?? '') : (others[0]?.user.name ?? '(알 수 없음)')
  return {
    id: convo.id,
    type: convo.type as 'DM' | 'GROUP',
    title: convo.title,
    displayName,
    members: convo.members.map((m) => toUserDto(m.user)),
    lastMessage: last
      ? { id: last.id, body: last.body, authorName: last.author.name, createdAt: last.createdAt.toISOString() }
      : null,
    unreadCount,
    mutedAt: meMember?.mutedAt?.toISOString() ?? null,
  }
}
