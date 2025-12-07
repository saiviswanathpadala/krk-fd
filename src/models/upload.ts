import { pgTable, uuid, varchar, integer, bigint, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { users } from './user';
import { propertyPendingChanges } from './propertyPendingChange';

export const uploads = pgTable('uploads', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 500 }).notNull(),
  ownerId: integer('owner_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  purpose: varchar('purpose', { length: 50 }).notNull(),
  clientUploadId: uuid('client_upload_id'),
  status: varchar('status', { length: 20 }).default('created'),
  size: bigint('size', { mode: 'number' }),
  contentType: varchar('content_type', { length: 100 }),
  referencedByChangeId: uuid('referenced_by_change_id').references(() => propertyPendingChanges.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const propertyPendingChangesIdempotency = pgTable('property_pending_changes_idempotency', {
  idempotencyKey: uuid('idempotency_key').primaryKey(),
  changeId: uuid('change_id').references(() => propertyPendingChanges.id, { onDelete: 'cascade' }).notNull(),
  status: varchar('status', { length: 20 }).default('completed'),
  createdAt: timestamp('created_at').defaultNow(),
});
