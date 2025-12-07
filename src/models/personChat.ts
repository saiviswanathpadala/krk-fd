import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './user';

export const personConversations = pgTable('person_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: text('type').notNull().default('admin-person'),
  participants: jsonb('participants').$type<number[]>().notNull(),
  adminId: integer('admin_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  personId: integer('person_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  personRole: text('person_role').notNull(),
  meta: jsonb('meta'),
  lastMessageAt: timestamp('last_message_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: integer('created_by').references(() => users.id),
}, (table) => ({
  adminPersonIdx: index('person_conversations_admin_person_idx').on(table.adminId, table.personId),
  participantsIdx: index('person_conversations_participants_idx').on(table.participants),
  uniquePairIdx: uniqueIndex('person_conversations_unique_pair_idx').on(table.adminId, table.personId),
}));

export const personMessages = pgTable('person_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id').notNull().references(() => personConversations.id, { onDelete: 'cascade' }),
  senderId: integer('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  recipientId: integer('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  attachments: jsonb('attachments'),
  status: text('status').notNull().default('sent'),
  meta: jsonb('meta'),
  createdAt: timestamp('created_at').defaultNow(),
  deliveredAt: timestamp('delivered_at'),
  readAt: timestamp('read_at'),
}, (table) => ({
  conversationCreatedIdx: index('person_messages_conversation_created_idx').on(table.conversationId, table.createdAt),
  recipientIdx: index('person_messages_recipient_idx').on(table.recipientId, table.createdAt),
}));
