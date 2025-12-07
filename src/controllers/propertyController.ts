import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { properties } from '../models/property';
import { propertyAgentAssignments } from '../models/propertyAssignment';
import { users } from '../models/user';
import { desc, lt, eq, and, inArray, sql } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: {
    userId: number;
    phone: string;
    role?: string;
  };
}

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().transform(val => Math.min(parseInt(val) || 10, 20)),
});

export const getProperties = async (req: AuthRequest, res: Response) => {
  try {
    const { cursor, limit } = querySchema.parse(req.query);
    const userRole = req.user?.role?.toLowerCase();
    const userId = req.user?.userId;
    
    // Build where conditions
    let whereConditions = [eq(properties.deleted, false)];
    
    // If user is an agent, only show properties assigned to them (check junction table)
    if (userRole === 'agent' && userId) {
      const agentAssignments = await db
        .select({ propertyId: propertyAgentAssignments.propertyId })
        .from(propertyAgentAssignments)
        .where(eq(propertyAgentAssignments.agentId, userId));
      
      const assignedPropertyIds = agentAssignments.map(a => a.propertyId);
      
      if (assignedPropertyIds.length > 0) {
        whereConditions.push(inArray(properties.id, assignedPropertyIds));
      } else {
        return res.json({ data: [], nextCursor: null, hasMore: false });
      }
    }
    
    // If user is a customer, filter by preferred categories
    if (userRole === 'customer' && userId) {
      const [user] = await db.select({ preferredCategories: users.preferredCategories })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      
      if (user?.preferredCategories && Array.isArray(user.preferredCategories) && user.preferredCategories.length > 0) {
        const categoriesArray = user.preferredCategories;
        whereConditions.push(
          sql`${properties.categories}::jsonb ?| array[${sql.join(categoriesArray.map(c => sql`${c}`), sql`, `)}]`
        );
      }
    }
    
    if (cursor) {
      whereConditions.push(lt(properties.id, cursor));
    }
    
    const results = await db.select().from(properties)
      .where(and(...whereConditions))
      .orderBy(desc(properties.id))
      .limit(limit + 1);
    
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? results[limit - 1].id : null;
    
    res.json({
      data,
      nextCursor,
      hasMore
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    res.status(500).json({ message: 'Failed to fetch properties' });
  }
};

export const getPropertyById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = req.user?.role?.toLowerCase();
    const userId = req.user?.userId;
    
    // Build where conditions
    let whereConditions = [
      eq(properties.id, id),
      eq(properties.deleted, false)
    ];
    
    // If user is an agent, only show properties assigned to them (check junction table)
    if (userRole === 'agent' && userId) {
      const agentAssignments = await db
        .select({ propertyId: propertyAgentAssignments.propertyId })
        .from(propertyAgentAssignments)
        .where(eq(propertyAgentAssignments.agentId, userId));
      
      const assignedPropertyIds = agentAssignments.map(a => a.propertyId);
      
      if (!assignedPropertyIds.includes(id)) {
        return res.status(404).json({ message: 'Property not found' });
      }
    }

    const property = await db.select().from(properties)
      .where(and(...whereConditions))
      .limit(1);
    
    if (property.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }

    res.json(property[0]);
  } catch (error: any) {
    console.error('Error fetching property:', error);
    res.status(500).json({ message: 'Failed to fetch property details' });
  }
};