import { Request, Response } from 'express';
import { db } from '../config/database';
import { propertyPendingChanges, bannerPendingChanges } from '../models/propertyPendingChange';
import { propertyAgentAssignments, propertyEmployeeAssignments } from '../models/propertyAssignment';
import { properties } from '../models/property';
import { eq, desc, and, or, sql } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: {
    userId: string;
    phone: string;
    role?: string;
  };
}

export const getEmployeeActivity = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const userId = parseInt(req.user.userId);
    const limit = parseInt(req.query.limit as string) || 20;
    const cursor = req.query.cursor as string;

    // Fetch property pending changes
    const propertyChanges = await db
      .select({
        id: propertyPendingChanges.id,
        type: sql<string>`'property_pending_change_created'`,
        title: sql<string>`CASE 
          WHEN ${propertyPendingChanges.propertyId} IS NULL THEN 'New Property Submitted'
          ELSE 'Property Update Submitted'
        END`,
        body: sql<string>`COALESCE(${propertyPendingChanges.proposedPayload}->>'title', 'Property')`,
        metadata: sql<any>`json_build_object(
          'propertyId', ${propertyPendingChanges.propertyId},
          'status', ${propertyPendingChanges.status},
          'isDraft', ${propertyPendingChanges.isDraft}
        )`,
        createdAt: propertyPendingChanges.createdAt,
      })
      .from(propertyPendingChanges)
      .where(
        and(
          eq(propertyPendingChanges.proposerId, userId),
          eq(propertyPendingChanges.isDraft, false)
        )
      )
      .orderBy(desc(propertyPendingChanges.createdAt))
      .limit(limit);

    // Fetch banner pending changes
    const bannerChanges = await db
      .select({
        id: bannerPendingChanges.id,
        type: sql<string>`'banner_pending_change_created'`,
        title: sql<string>`CASE 
          WHEN ${bannerPendingChanges.bannerId} IS NULL THEN 'New Banner Submitted'
          ELSE 'Banner Update Submitted'
        END`,
        body: sql<string>`COALESCE(${bannerPendingChanges.proposedPayload}->>'title', 'Banner')`,
        metadata: sql<any>`json_build_object(
          'bannerId', ${bannerPendingChanges.bannerId},
          'status', ${bannerPendingChanges.status}
        )`,
        createdAt: bannerPendingChanges.createdAt,
      })
      .from(bannerPendingChanges)
      .where(eq(bannerPendingChanges.proposerId, userId))
      .orderBy(desc(bannerPendingChanges.createdAt))
      .limit(limit);

    // Fetch property assignments
    const assignments = await db
      .select({
        id: propertyAgentAssignments.id,
        type: sql<string>`'property_assignment'`,
        title: sql<string>`'Property Assigned to Agent'`,
        body: sql<string>`'You assigned a property to an agent'`,
        metadata: sql<any>`json_build_object(
          'propertyId', ${propertyAgentAssignments.propertyId},
          'agentId', ${propertyAgentAssignments.agentId}
        )`,
        createdAt: propertyAgentAssignments.assignedAt,
      })
      .from(propertyAgentAssignments)
      .innerJoin(properties, eq(propertyAgentAssignments.propertyId, properties.id))
      .innerJoin(propertyEmployeeAssignments, eq(propertyAgentAssignments.propertyId, propertyEmployeeAssignments.propertyId))
      .where(and(
        eq(propertyAgentAssignments.assignedByEmployeeId, userId),
        eq(properties.deleted, false),
        eq(propertyEmployeeAssignments.employeeId, userId)
      ))
      .orderBy(desc(propertyAgentAssignments.assignedAt))
      .limit(limit);

    // Combine and sort all activities
    const allActivities = [...propertyChanges, ...bannerChanges, ...assignments]
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime())
      .slice(0, limit);

    res.json({
      data: allActivities,
      nextCursor: allActivities.length === limit ? allActivities[allActivities.length - 1].id : null,
    });
  } catch (error) {
    console.error('Error fetching employee activity:', error);
    res.status(500).json({ message: 'Failed to fetch activity' });
  }
};
