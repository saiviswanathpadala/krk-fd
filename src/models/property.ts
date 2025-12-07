import { pgTable, uuid, varchar, numeric, text, jsonb, timestamp, integer, boolean } from 'drizzle-orm/pg-core';
import { users } from './user';

export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  location: varchar('location', { length: 255 }).notNull(),
  price: numeric('price'),
  images: jsonb('images').$type<string[]>().default([]),
  gallery: jsonb('gallery').$type<string[]>().default([]),
  description: text('description'),
  features: jsonb('features').$type<string[]>().default([]),
  amenities: jsonb('amenities').$type<string[]>().default([]),
  categories: jsonb('categories').$type<string[]>().default([]),
  brochureUrl: text('brochure_url'),
  map: varchar('map', { length: 500 }),
  website: varchar('website', { length: 500 }),
  type: varchar('type', { length: 50 }).default('Featured'),
  assignedEmployeeId: integer('assigned_employee_id').references(() => users.id),
  assignedAgentId: integer('assigned_agent_id').references(() => users.id),
  createdByAdminId: integer('created_by_admin_id').references(() => users.id),
  createdByEmployeeId: integer('created_by_employee_id').references(() => users.id),
  deleted: boolean('deleted').default(false),
  deletedAt: timestamp('deleted_at'),
  deletedByAdminId: integer('deleted_by_admin_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});