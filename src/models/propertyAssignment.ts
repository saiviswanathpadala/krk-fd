import { pgTable, serial, uuid, integer, timestamp } from 'drizzle-orm/pg-core';
import { properties } from './property';
import { users } from './user';

export const propertyEmployeeAssignments = pgTable('property_employee_assignments', {
  id: serial('id').primaryKey(),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  employeeId: integer('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at').defaultNow(),
  assignedByAdminId: integer('assigned_by_admin_id').references(() => users.id),
});

export const propertyAgentAssignments = pgTable('property_agent_assignments', {
  id: serial('id').primaryKey(),
  propertyId: uuid('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  agentId: integer('agent_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedAt: timestamp('assigned_at').defaultNow(),
  assignedByEmployeeId: integer('assigned_by_employee_id').references(() => users.id),
});
