import { pgTable, uuid, integer, jsonb, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { properties } from './property';
import { users } from './user';

export const propertyPendingChanges = pgTable('property_pending_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }),
  proposerId: integer('proposer_id').references(() => users.id),
  proposedPayload: jsonb('proposed_payload').$type<any>().notNull(),
  diffSummary: jsonb('diff_summary').$type<any>(),
  status: text('status').default('pending'),
  reason: text('reason'),
  isDraft: boolean('is_draft').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  reviewedAt: timestamp('reviewed_at'),
  reviewedByAdminId: integer('reviewed_by_admin_id').references(() => users.id),
});

export const bannerPendingChanges = pgTable('banner_pending_changes', {
  id: uuid('id').primaryKey().defaultRandom(),
  bannerId: uuid('banner_id'),
  proposerId: integer('proposer_id').references(() => users.id),
  proposedPayload: jsonb('proposed_payload').$type<any>().notNull(),
  diffSummary: jsonb('diff_summary').$type<any>(),
  status: text('status').default('pending'),
  reason: text('reason'),
  createdAt: timestamp('created_at').defaultNow(),
  reviewedAt: timestamp('reviewed_at'),
  reviewedByAdminId: integer('reviewed_by_admin_id').references(() => users.id),
});
