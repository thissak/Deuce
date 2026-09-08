import { z } from 'zod'

export const AgentScopeSchema = z.enum(['CHANNELS', 'ALL'])
export const AgentDtoSchema = z.object({
  id: z.string(), name: z.string(), ownerName: z.string(), ownerId: z.string(),
  scope: AgentScopeSchema, conversationId: z.string().nullable(),
  expiresAt: z.string(), revoked: z.boolean(), editable: z.boolean(),
  participating: z.boolean().optional(), excluded: z.boolean().optional(), scopeAllows: z.boolean().optional(),
})
export const AgentKeySchema = z.object({ id: z.string(), token: z.string(), expiresAt: z.string() })
export type AgentDto = z.infer<typeof AgentDtoSchema>
export type AgentScope = z.infer<typeof AgentScopeSchema>
export type AgentKey = z.infer<typeof AgentKeySchema>
