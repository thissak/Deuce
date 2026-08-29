import type { Prisma, User } from '@prisma/client'
import type { MessageDto, UserDto } from '@deuce/shared'

export function toUserDto(u: User): UserDto {
  return { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl }
}

export const messageInclude = {
  author: true,
  replyTo: { include: { author: true } },
  reactions: true,
  mentions: true,
  attachments: true,
} as const

type MessageWithRels = Prisma.MessageGetPayload<{ include: typeof messageInclude }>

export function toMessageDto(m: MessageWithRels): MessageDto {
  const grouped = new Map<string, string[]>()
  for (const r of m.reactions) grouped.set(r.emoji, [...(grouped.get(r.emoji) ?? []), r.userId])
  return {
    id: m.id,
    conversationId: m.conversationId,
    author: toUserDto(m.author),
    body: m.deletedAt ? '' : m.body,
    deleted: m.deletedAt !== null,
    replyTo: m.replyTo
      ? {
          id: m.replyTo.id,
          body: m.replyTo.deletedAt ? '' : m.replyTo.body,
          authorName: m.replyTo.author.name,
          deleted: m.replyTo.deletedAt !== null,
        }
      : null,
    reactions: [...grouped.entries()].map(([emoji, userIds]) => ({ emoji, userIds })),
    mentions: m.mentions.map((x) => x.mentionedUserId),
    attachments: m.attachments.map((a) => ({
      id: a.id, fileName: a.fileName, size: a.size, contentType: a.contentType,
    })),
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    pinnedAt: m.pinnedAt?.toISOString() ?? null,
  }
}
