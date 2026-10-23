import { z } from 'zod'

/** 방에 연결된 AI 세션. 키 원문은 발급 응답(AgentKey)에서만 한 번 전달한다. */
export const RoomAgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerName: z.string(),
  editable: z.boolean(),
  lastConnectedAt: z.string().nullable(),
  expiresAt: z.string(),
})
export type RoomAgent = z.infer<typeof RoomAgentSchema>

export const AgentKeySchema = z.object({
  id: z.string(),
  token: z.string(),
  expiresAt: z.string(),
})
export type AgentKey = z.infer<typeof AgentKeySchema>
