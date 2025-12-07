import { pgTable, uuid, integer, varchar, bigint, boolean, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { users } from './user';

export const loanRequests = pgTable('loan_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  userName: varchar('user_name', { length: 100 }).notNull(),
  userEmail: varchar('user_email', { length: 100 }).notNull(),
  userPhone: varchar('user_phone', { length: 15 }).notNull(),
  userLocation: varchar('user_location', { length: 100 }),
  userPreferredCategories: jsonb('user_preferred_categories').$type<string[]>(),
  loanType: varchar('loan_type', { length: 50 }).notNull(),
  propertyCategory: varchar('property_category', { length: 50 }).notNull(),
  propertyValue: bigint('property_value', { mode: 'number' }).notNull(),
  loanAmountNeeded: bigint('loan_amount_needed', { mode: 'number' }).notNull(),
  employmentType: varchar('employment_type', { length: 50 }).notNull(),
  monthlyIncome: bigint('monthly_income', { mode: 'number' }).notNull(),
  preferredTenure: varchar('preferred_tenure', { length: 20 }).notNull(),
  existingLoans: boolean('existing_loans').notNull(),
  existingLoanDetails: text('existing_loan_details'),
  preferredContactTime: varchar('preferred_contact_time', { length: 50 }).notNull(),
  additionalNotes: text('additional_notes'),
  status: varchar('status', { length: 20 }).notNull().default('received'),
  assigneeId: integer('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  version: integer('version').notNull().default(1),
  priority: varchar('priority', { length: 20 }).default('normal'),
  slaDueAt: timestamp('sla_due_at'),
  lastActivityAt: timestamp('last_activity_at').defaultNow(),
  isEscalated: boolean('is_escalated').default(false),
  escalationReason: text('escalation_reason'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),
});

export const loanRequestComments = pgTable('loan_request_comments', {
  id: uuid('id').primaryKey().defaultRandom(),
  loanRequestId: uuid('loan_request_id').notNull().references(() => loanRequests.id, { onDelete: 'cascade' }),
  authorId: integer('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  isPublic: boolean('is_public').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const loanRequestAssignments = pgTable('loan_request_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  loanRequestId: uuid('loan_request_id').notNull().references(() => loanRequests.id, { onDelete: 'cascade' }),
  assignedById: integer('assigned_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assigneeId: integer('assignee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  comment: text('comment'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const loanRequestAuditLogs = pgTable('loan_request_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  loanRequestId: uuid('loan_request_id').notNull().references(() => loanRequests.id, { onDelete: 'cascade' }),
  actorId: integer('actor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  action: varchar('action', { length: 50 }).notNull(),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  comment: text('comment'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
