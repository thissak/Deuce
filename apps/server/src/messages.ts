import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from './db/client.js';
import { messages, users, type MessageRow } from './db/schema.js';

export const channelId = 'general' as const;

export const sendMessageSchema = z.object({
  clientMessageId: z.uuid(),
  channelId: z.literal(channelId),
  body: z.string().trim().min(1).max(4000),
});

export const messageQuerySchema = z.object({
  channelId: z.literal(channelId).default(channelId),
  afterSequence: z.coerce.number().int().min(0).default(0),
});

export type Message = {
  id: string;
  clientMessageId: string;
  sequence: number;
  channelId: string;
  authorId: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
};

export type StoredMessage = {
  message: Message;
  inserted: boolean;
};

export function toMessage(row: MessageRow, authorDisplayName: string): Message {
  return {
    id: row.id,
    clientMessageId: row.clientMessageId,
    sequence: row.sequence,
    channelId: row.channelId,
    authorId: row.authorId,
    authorDisplayName,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listMessages(
  db: Database,
  afterSequence: number,
): Promise<Message[]> {
  const rows = await db
    .select({ message: messages, authorDisplayName: users.displayName })
    .from(messages)
    .leftJoin(users, sql`${users.id}::text = ${messages.authorId}`)
    .where(
      and(eq(messages.channelId, channelId), gt(messages.sequence, afterSequence)),
    )
    .orderBy(asc(messages.sequence));

  return rows.map((row) =>
    toMessage(row.message, row.authorDisplayName ?? row.message.authorId),
  );
}

export async function storeMessage(
  db: Database,
  authorId: string,
  authorDisplayName: string,
  input: z.infer<typeof sendMessageSchema>,
): Promise<StoredMessage> {
  const [inserted] = await db
    .insert(messages)
    .values({
      clientMessageId: input.clientMessageId,
      channelId: input.channelId,
      authorId,
      body: input.body,
    })
    .onConflictDoNothing({
      target: [messages.authorId, messages.clientMessageId],
    })
    .returning();

  if (inserted) {
    return {
      message: toMessage(inserted, authorDisplayName),
      inserted: true,
    };
  }

  const [existing] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.authorId, authorId),
        eq(messages.clientMessageId, input.clientMessageId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error('Message conflict could not be resolved');
  }

  return {
    message: toMessage(existing, authorDisplayName),
    inserted: false,
  };
}
