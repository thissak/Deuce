import { PrismaClient } from '@prisma/client'

export const testDb = new PrismaClient()

export async function resetDb(): Promise<void> {
  await testDb.$executeRawUnsafe(
    'TRUNCATE TABLE "Mention", "Reaction", "ReadState", "Attachment", "Message", "ConversationMember", "Conversation", "User" CASCADE',
  )
}
