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
