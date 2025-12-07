import { db } from '../config/database';
import { users } from '../models/user';
import { properties } from '../models/property';
import { banners } from '../models/banner';
import { propertyPendingChanges, bannerPendingChanges } from '../models/propertyPendingChange';
import { sql, eq, or, and } from 'drizzle-orm';

export const dashboardService = {
  async getStats() {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [customerStats, agentStats, employeeStats, propertyStats, bannerStats, pendingChangesStats] = await Promise.all([
      // Customer stats - handle both 'customer' and 'Customer'
      db.select({
        today: sql<number>`SUM(CASE WHEN created_at >= ${startOfToday} THEN 1 ELSE 0 END)`,
        total: sql<number>`COUNT(*)`,
      })
      .from(users)
      .where(and(
        or(eq(users.role, 'customer'), eq(users.role, 'Customer')),
        eq(users.deleted, false)
      )),

      // Agent stats - handle both 'agent' and 'Agent'
      db.select({
        approved: sql<number>`SUM(CASE WHEN COALESCE(approved, true) = true THEN 1 ELSE 0 END)`,
        pending: sql<number>`SUM(CASE WHEN COALESCE(approved, true) = false THEN 1 ELSE 0 END)`,
      })
      .from(users)
      .where(and(
        or(eq(users.role, 'agent'), eq(users.role, 'Agent')),
        eq(users.deleted, false)
      )),

      // Employee stats - handle both 'employee' and 'Employee'
      db.select({
        active: sql<number>`SUM(CASE WHEN last_login >= ${thirtyDaysAgo} THEN 1 ELSE 0 END)`,
        inactive: sql<number>`SUM(CASE WHEN last_login IS NULL OR last_login < ${thirtyDaysAgo} THEN 1 ELSE 0 END)`,
      })
      .from(users)
      .where(and(
        or(eq(users.role, 'employee'), eq(users.role, 'Employee')),
        eq(users.deleted, false)
      )),

      // Property stats
      db.select({
        total: sql<number>`COUNT(*)`,
        pending: sql<number>`0`,
      })
      .from(properties)
      .where(eq(properties.deleted, false)),

      // Banner stats
      db.select({
        active: sql<number>`SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END)`,
        pending: sql<number>`0`,
      })
      .from(banners),

      // Pending changes stats
      Promise.all([
        db.select({ count: sql<number>`COUNT(*)` })
          .from(propertyPendingChanges)
          .where(eq(propertyPendingChanges.status, 'pending')),
        db.select({ count: sql<number>`COUNT(*)` })
          .from(propertyPendingChanges)
          .where(eq(propertyPendingChanges.status, 'needs_revision')),
        db.select({ count: sql<number>`COUNT(*)` })
          .from(bannerPendingChanges)
          .where(eq(bannerPendingChanges.status, 'pending')),
        db.select({ count: sql<number>`COUNT(*)` })
          .from(bannerPendingChanges)
          .where(eq(bannerPendingChanges.status, 'needs_revision')),
      ]).then(([propPending, propNeedsRevision, bannerPending, bannerNeedsRevision]) => ({
        propertyPending: Number(propPending[0]?.count || 0),
        propertyNeedsRevision: Number(propNeedsRevision[0]?.count || 0),
        bannerPending: Number(bannerPending[0]?.count || 0),
        bannerNeedsRevision: Number(bannerNeedsRevision[0]?.count || 0),
      })),
    ]);

    return {
      customers: {
        today: Number(customerStats[0]?.today || 0),
        total: Number(customerStats[0]?.total || 0),
      },
      agents: {
        approved: Number(agentStats[0]?.approved || 0),
        pending: Number(agentStats[0]?.pending || 0),
      },
      employees: {
        active: Number(employeeStats[0]?.active || 0),
        inactive: Number(employeeStats[0]?.inactive || 0),
      },
      properties: {
        total: Number(propertyStats[0]?.total || 0),
        pending: pendingChangesStats.propertyPending,
        needsRevision: pendingChangesStats.propertyNeedsRevision,
      },
      banners: {
        active: Number(bannerStats[0]?.active || 0),
        pending: pendingChangesStats.bannerPending,
        needsRevision: pendingChangesStats.bannerNeedsRevision,
      },
      pendingChanges: {
        needsReview: pendingChangesStats.propertyPending + pendingChangesStats.bannerPending,
        total: pendingChangesStats.propertyPending + pendingChangesStats.propertyNeedsRevision + pendingChangesStats.bannerPending + pendingChangesStats.bannerNeedsRevision,
      },
      lastUpdated: new Date().toISOString(),
    };
  },
};
