import { pgTable, text, uuid, timestamp, boolean, integer } from 'drizzle-orm/pg-core';

export const banners = pgTable('banners', {
  id: uuid('id').primaryKey().defaultRandom(),
  imageUrl: text('image_url').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull(),
  targetRole: text('target_role').notNull().default('All'),
  isActive: boolean('is_active').notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
