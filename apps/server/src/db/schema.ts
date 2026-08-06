import {
  boolean,
  index,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    oidcIssuer: text('oidc_issuer').notNull(),
    oidcSubject: text('oidc_subject').notNull(),
    displayName: varchar('display_name', { length: 120 }).notNull(),
    actorType: varchar('actor_type', { length: 32 }).default('human').notNull(),
    isAdmin: boolean('is_admin').default(false).notNull(),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('users_oidc_identity_uidx').on(
      table.oidcIssuer,
      table.oidcSubject,
    ),
  ],
);

export const channelMemberships = pgTable(
  'channel_memberships',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channelId: varchar('channel_id', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.channelId] }),
    index('channel_memberships_channel_idx').on(table.channelId),
  ],
);

export const revokedOidcSessions = pgTable(
  'revoked_oidc_sessions',
  {
    oidcIssuer: text('oidc_issuer').notNull(),
    oidcSessionId: text('oidc_session_id').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.oidcIssuer, table.oidcSessionId] }),
    index('revoked_oidc_sessions_expiry_idx').on(table.expiresAt),
  ],
);

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
