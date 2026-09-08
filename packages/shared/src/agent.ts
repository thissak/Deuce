import { z } from 'zod'

export const AgentScopeSchema = z.enum(['SELECTED', 'CHANNELS', 'ALL'])
export const AgentDtoSchema = z.object({
  id: z.string(), userId: z.string().optional(), name: z.string(), ownerName: z.string(), ownerId: z.string(),
  scope: AgentScopeSchema, conversationId: z.string().nullable(),
  expiresAt: z.string(), revoked: z.boolean(), editable: z.boolean(),
  participating: z.boolean().optional(), excluded: z.boolean().optional(), scopeAllows: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  lastConnectedAt: z.string().nullable().optional(),
  runtime: z.enum(['OFFLINE', 'READY', 'BUSY']).optional(),
})
export const AgentKeySchema = z.object({ id: z.string(), token: z.string(), expiresAt: z.string() })
export type AgentDto = z.infer<typeof AgentDtoSchema>
export type AgentScope = z.infer<typeof AgentScopeSchema>

export const AgentRunSchema = z.object({
  id: z.string(), agentId: z.string(), conversationId: z.string(),
  status: z.enum(['RUNNING', 'COMPLETED', 'FAILED']),
  errorCode: z.string().nullable(), resultMessageId: z.string().nullable(),
})
export type AgentRun = z.infer<typeof AgentRunSchema>
export type AgentKey = z.infer<typeof AgentKeySchema>
