import { pgTable, serial, varchar, boolean, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  phone: varchar('phone', { length: 15 }).notNull().unique(),
  name: varchar('name', { length: 100 }),
  email: varchar('email', { length: 100 }),
  city: varchar('city', { length: 100 }),
  dateOfBirth: timestamp('date_of_birth'),
  profileImgUrl: varchar('profile_img_url', { length: 500 }),
  profileCompleted: boolean('profile_completed').default(false),
  role: varchar('role', { length: 20 }).default('customer'),
  active: boolean('active').default(true),
  approved: boolean('approved').default(true),
  approvedAt: timestamp('approved_at'),
  rejectedReason: varchar('rejected_reason', { length: 500 }),
  rejectedAt: timestamp('rejected_at'),
  assignedEmployeeId: integer('assigned_employee_id'),
  referredByAgentId: integer('referred_by_agent_id'),
  department: varchar('department', { length: 100 }),
  preferredCategories: jsonb('preferred_categories').$type<string[]>().default([]),
  deleted: boolean('deleted').default(false),
  deletedAt: timestamp('deleted_at'),
  deletedByAdminId: integer('deleted_by_admin_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  lastLogin: timestamp('last_login').defaultNow(),
});

export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id').references(() => users.id, { onDelete: 'cascade' }),
  actionType: varchar('action_type', { length: 100 }).notNull(),
  targetType: varchar('target_type', { length: 50 }),
  targetId: integer('target_id'),
  details: jsonb('details'),
  createdAt: timestamp('created_at').defaultNow(),
});