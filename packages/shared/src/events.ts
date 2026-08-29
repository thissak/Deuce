import { z } from 'zod'
import type { MessageDto } from './message.js'

export const RT = {
  messageNew: 'message.new',
  messageUpdated: 'message.updated',
  messageDeleted: 'message.deleted',
  reactionChanged: 'reaction.changed',
  readAdvanced: 'read.advanced',
  conversationCreated: 'conversation.created',
  conversationUpdated: 'conversation.updated',
  conversationRemoved: 'conversation.removed',
  presenceChanged: 'presence.changed',
} as const

export const RTC = {
  presenceAway: 'presence:away',
  presenceActive: 'presence:active',
} as const

export interface ReadAdvancedPayload {
  conversationId: string
  userId: string
  lastReadMessageId: string
}

export interface ConversationEventPayload {
  conversationId: string
}

export interface PresencePayload {
  userId: string
  status: 'online' | 'away' | 'offline'
}

export type MessageEventPayload = MessageDto

export interface ServerToClientEvents {
  'message.new': (m: MessageDto) => void
  'message.updated': (m: MessageDto) => void
  'message.deleted': (m: MessageDto) => void
  'reaction.changed': (m: MessageDto) => void
  'read.advanced': (p: ReadAdvancedPayload) => void
  'conversation.created': (p: ConversationEventPayload) => void
  'conversation.updated': (p: ConversationEventPayload) => void
  'conversation.removed': (p: ConversationEventPayload) => void
  'presence.changed': (p: PresencePayload) => void
}

export interface ClientToServerEvents {
  'presence:away': () => void
  'presence:active': () => void
}

export const PresenceSnapshotSchema = z.record(z.string(), z.enum(['online', 'away']))
export type PresenceSnapshot = z.infer<typeof PresenceSnapshotSchema>
