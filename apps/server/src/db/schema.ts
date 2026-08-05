import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const messages = pgTable(
  'messages',
  {
    sequence: serial('sequence').primaryKey(),
    id: uuid('id').defaultRandom().notNull().unique(),
    clientMessageId: uuid('client_message_id').notNull(),
    channelId: varchar('channel_id', { length: 64 }).notNull(),
    authorId: varchar('author_id', { length: 64 }).notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('messages_author_client_message_uidx').on(
      table.authorId,
      table.clientMessageId,
    ),
    index('messages_channel_sequence_idx').on(table.channelId, table.sequence),
  ],
);

export type MessageRow = typeof messages.$inferSelect;
