import { pgTable, uuid, text, timestamp, boolean, jsonb, integer } from 'drizzle-orm/pg-core';
import { users } from './user';

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title'),
  context: jsonb('context'),
  lastMessageAt: timestamp('last_message_at').defaultNow(),
  deleted: boolean('deleted').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  sender: text('sender').notNull(),
  content: text('content').notNull(),
  status: text('status').default('sent'),
  meta: jsonb('meta'),
  createdAt: timestamp('created_at').defaultNow(),
  receivedAt: timestamp('received_at'),
  externalId: text('external_id'),
});
