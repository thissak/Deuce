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
  let lastRead: { createdAt: Date; id: string } | null = null
  if (read?.lastReadMessageId) {
    const lr = await prisma.message.findUnique({ where: { id: read.lastReadMessageId } })
    if (lr) lastRead = { createdAt: lr.createdAt, id: lr.id }
  }
  const meMember = convo.members.find((m) => m.userId === meId)
  // 기준선: 읽음 커서 > (없으면) 합류 시점. 커서 비교는 페이지네이션과 같은 (createdAt, id) 순서.
  const unreadCount = await prisma.message.count({
    where: {
      conversationId,
      deletedAt: null,
      authorId: { not: meId },
      ...(lastRead
        ? {
            OR: [
              { createdAt: { gt: lastRead.createdAt } },
              { createdAt: lastRead.createdAt, id: { gt: lastRead.id } },
            ],
          }
        : meMember
          ? { createdAt: { gt: meMember.joinedAt } }
          : {}),
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
