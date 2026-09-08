import { z } from 'zod'
import { UserDtoSchema } from './user.js'

export const SearchResultSchema = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  conversationType: z.enum(['DM', 'GROUP', 'CHANNEL']),
  conversationTitle: z.string().nullable(),
  body: z.string(),
  authorName: z.string(),
  createdAt: z.string(),
})
export type SearchResult = z.infer<typeof SearchResultSchema>

export const ActivityItemSchema = z.object({
  kind: z.enum(['mention', 'reaction']),
  messageId: z.string(),
  conversationId: z.string(),
  body: z.string(),
  actor: UserDtoSchema,
  emoji: z.string().nullable(),
  createdAt: z.string(),
})
export type ActivityItem = z.infer<typeof ActivityItemSchema>
