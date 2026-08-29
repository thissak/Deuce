import { z } from 'zod'
import { UserDtoSchema } from './user.js'

export const ConversationSummarySchema = z.object({
  id: z.string(),
  type: z.enum(['DM', 'GROUP']),
  title: z.string().nullable(),
  displayName: z.string(),
  members: z.array(UserDtoSchema),
  lastMessage: z
    .object({
      id: z.string(),
      body: z.string(),
      authorName: z.string(),
      createdAt: z.string(),
    })
    .nullable(),
  unreadCount: z.number().int(),
  mutedAt: z.string().nullable(),
})

export type ConversationSummary = z.infer<typeof ConversationSummarySchema>
