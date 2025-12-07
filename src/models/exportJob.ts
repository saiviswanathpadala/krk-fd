import { pgTable, uuid, integer, varchar, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { users } from './user';

export const exportJobs = pgTable('export_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobType: varchar('job_type', { length: 50 }).notNull(),
  requestedBy: integer('requested_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  filters: jsonb('filters'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  fileUrl: text('file_url'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

export const adminSlaConfigs = pgTable('admin_sla_configs', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  configKey: varchar('config_key', { length: 100 }).notNull().unique(),
  configValue: jsonb('config_value').notNull(),
  updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
