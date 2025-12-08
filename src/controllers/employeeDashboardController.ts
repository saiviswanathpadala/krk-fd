import { Request, Response } from 'express';
import { db } from '../config/database';
import { properties } from '../models/property';
import { propertyPendingChanges, bannerPendingChanges } from '../models/propertyPendingChange';
import { banners } from '../models/banner';
import { users } from '../models/user';
import { propertyEmployeeAssignments } from '../models/propertyAssignment';
import { eq, and, count, or, sql } from 'drizzle-orm';
import { emitPendingChangeUpdate, emitAssignmentUpdate } from '../services/socketService';

interface AuthRequest extends Request {
  user?: {
    userId: number;
    role?: string;
  };
}

export const getEmployeeDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = req.user!.userId;

    // Properties stats
    const [propertiesTotal] = await db
      .select({ count: sql<number>`count(DISTINCT ${propertyEmployeeAssignments.propertyId})` })
      .from(propertyEmployeeAssignments)
      .innerJoin(properties, eq(propertyEmployeeAssignments.propertyId, properties.id))
      .where(and(
        eq(propertyEmployeeAssignments.employeeId, employeeId),
        eq(properties.deleted, false)
      ));

    const [propertiesUnderReview] = await db
      .select({ count: count() })
      .from(propertyPendingChanges)
      .where(and(
        eq(propertyPendingChanges.proposerId, employeeId),
        eq(propertyPendingChanges.status, 'pending')
      ));

    // Banners stats
    const [bannersActive] = await db
      .select({ count: count() })
      .from(banners)
      .where(eq(banners.isActive, true));

    const [bannersUnderReview] = await db
      .select({ count: count() })
      .from(bannerPendingChanges)
      .where(and(
        eq(bannerPendingChanges.proposerId, employeeId),
        eq(bannerPendingChanges.status, 'pending')
      ));

    // Agents stats
    const [agentsTotal] = await db
      .select({ count: count() })
      .from(users)
      .where(and(
        or(eq(users.role, 'agent'), eq(users.role, 'Agent')),
        eq(users.assignedEmployeeId, employeeId),
        eq(users.deleted, false)
      ));

    const stats = {
      properties: {
        totalAssigned: propertiesTotal.count,
        underReview: propertiesUnderReview.count
      },
      banners: {
        active: bannersActive.count,
        underReview: bannersUnderReview.count
      },
      agents: {
        totalAssigned: agentsTotal.count
      },
      lastUpdated: new Date().toISOString()
    };

    res.json(stats);
  } catch (error) {
    console.error('Employee dashboard stats error:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard stats' });
  }
};

// Helper functions to emit socket events when data changes
export const notifyPendingChangeUpdate = (employeeId: number, type: 'property' | 'banner', delta: number) => {
  emitPendingChangeUpdate(employeeId, type, { underReviewChange: delta });
};

export const notifyAssignmentUpdate = (employeeId: number, type: 'property' | 'agent', delta: number) => {
  emitAssignmentUpdate(employeeId, type, { totalAssignedChange: delta });
};
