import { z } from 'zod'
import { UserDtoSchema } from './user.js'

export const MessageDtoSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  author: UserDtoSchema,
  body: z.string(),
  deleted: z.boolean(),
  replyTo: z
    .object({ id: z.string(), body: z.string(), authorName: z.string(), deleted: z.boolean() })
    .nullable(),
  reactions: z.array(z.object({ emoji: z.string(), userIds: z.array(z.string()) })),
  mentions: z.array(z.string()),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  pinnedAt: z.string().nullable(),
})

export type MessageDto = z.infer<typeof MessageDtoSchema>
