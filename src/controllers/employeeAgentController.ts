import { Request, Response } from 'express';
import { z } from 'zod';
import { db, dbTx } from '../config/database';
import { users } from '../models/user';
import { properties } from '../models/property';
import { propertyAgentAssignments, propertyEmployeeAssignments } from '../models/propertyAssignment';
import { adminAuditLogs } from '../models/user';
import { desc, eq, and, or, ilike, sql, inArray, count } from 'drizzle-orm';
import { emitAssignmentUpdate } from '../services/socketService';

interface AuthRequest extends Request {
  user?: { userId: number; role?: string };
}

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().optional().default('20').transform(val => Math.min(parseInt(val) || 20, 50)),
  q: z.string().optional(),
  city: z.string().optional(),
});

export const getEmployeeAgents = async (req: AuthRequest, res: Response) => {
  try {
    const { cursor, limit, q, city } = querySchema.parse(req.query);
    const employeeId = req.user!.userId;
    
    let whereConditions = [
      or(eq(users.role, 'agent'), eq(users.role, 'Agent'))!,
      eq(users.assignedEmployeeId, employeeId),
      eq(users.deleted, false),
      eq(users.approved, true)
    ];
    
    if (q) {
      whereConditions.push(
        or(
          ilike(users.name, `%${q}%`),
          ilike(users.email, `%${q}%`),
          ilike(users.phone, `%${q}%`)
        )!
      );
    }
    
    if (city) {
      whereConditions.push(ilike(users.city, `%${city}%`));
    }
    
    if (cursor) {
      whereConditions.push(sql`${users.createdAt} < (SELECT created_at FROM users WHERE id = ${cursor})`);
    }
    
    const results = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      city: users.city,
      profileImgUrl: users.profileImgUrl,
      createdAt: users.createdAt,
    }).from(users)
      .where(and(...whereConditions))
      .orderBy(desc(users.createdAt))
      .limit(limit + 1);
    
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;
    
    // Get assigned properties count for each agent from junction table
    const agentIds = data.map(a => a.id);
    const propertyCounts = agentIds.length > 0 ? await db
      .select({
        agentId: propertyAgentAssignments.agentId,
        count: sql<number>`count(DISTINCT ${propertyAgentAssignments.propertyId})`
      })
      .from(propertyAgentAssignments)
      .innerJoin(properties, eq(propertyAgentAssignments.propertyId, properties.id))
      .innerJoin(propertyEmployeeAssignments, eq(propertyAgentAssignments.propertyId, propertyEmployeeAssignments.propertyId))
      .where(and(
        inArray(propertyAgentAssignments.agentId, agentIds),
        eq(properties.deleted, false),
        eq(propertyEmployeeAssignments.employeeId, employeeId)
      ))
      .groupBy(propertyAgentAssignments.agentId) : [];
    
    const countMap = new Map(propertyCounts.map(c => [c.agentId, c.count]));
    
    const enrichedData = data.map(agent => ({
      ...agent,
      assignedPropertiesCount: countMap.get(agent.id) || 0
    }));
    
    res.json({ data: enrichedData, nextCursor: hasMore ? data[data.length - 1].id.toString() : null });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Error fetching employee agents:', error);
    res.status(500).json({ message: 'Failed to fetch agents' });
  }
};

export const getEmployeeAgentById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employeeId = req.user!.userId;
    
    const [agent] = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      city: users.city,
      profileImgUrl: users.profileImgUrl,
      createdAt: users.createdAt,
    }).from(users)
      .where(and(
        eq(users.id, parseInt(id)),
        or(eq(users.role, 'agent'), eq(users.role, 'Agent'))!,
        eq(users.assignedEmployeeId, employeeId),
        eq(users.deleted, false),
        eq(users.approved, true)
      ))
      .limit(1);
    
    if (!agent) {
      return res.status(404).json({ message: 'Agent not found or not assigned to you' });
    }
    
    const [propertyCount] = await db
      .select({ count: sql<number>`count(DISTINCT ${propertyAgentAssignments.propertyId})` })
      .from(propertyAgentAssignments)
      .innerJoin(properties, eq(propertyAgentAssignments.propertyId, properties.id))
      .innerJoin(propertyEmployeeAssignments, eq(propertyAgentAssignments.propertyId, propertyEmployeeAssignments.propertyId))
      .where(and(
        eq(propertyAgentAssignments.agentId, agent.id),
        eq(properties.deleted, false),
        eq(propertyEmployeeAssignments.employeeId, employeeId)
      ));
    
    const referredCustomers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      profileImgUrl: users.profileImgUrl,
    })
    .from(users)
    .where(and(
      eq(users.referredByAgentId, agent.id),
      ilike(users.role, 'customer'),
      eq(users.deleted, false)
    ));
    
    res.json({ 
      data: { 
        ...agent, 
        assignedPropertiesCount: propertyCount.count,
        referredCustomers
      } 
    });
  } catch (error) {
    console.error('Error fetching employee agent:', error);
    res.status(500).json({ message: 'Failed to fetch agent' });
  }
};

const assignPropertiesSchema = z.object({
  propertyIds: z.array(z.string()).max(100),
  note: z.string().optional(),
});

export const getAgentAssignedProperties = async (req: AuthRequest, res: Response) => {
  try {
    const { id: agentId } = req.params;
    const employeeId = req.user!.userId;
    
    // Validate agent exists and is assigned to employee
    const [agent] = await db.select()
      .from(users)
      .where(and(
        eq(users.id, parseInt(agentId)),
        or(eq(users.role, 'agent'), eq(users.role, 'Agent'))!,
        eq(users.assignedEmployeeId, employeeId),
        eq(users.approved, true),
        eq(users.deleted, false)
      ))
      .limit(1);
    
    if (!agent) {
      return res.status(403).json({ message: 'Agent not found or not assigned to you' });
    }
    
    // Get assigned property IDs from junction table
    const assignments = await db
      .select({ propertyId: propertyAgentAssignments.propertyId })
      .from(propertyAgentAssignments)
      .innerJoin(properties, eq(propertyAgentAssignments.propertyId, properties.id))
      .innerJoin(propertyEmployeeAssignments, eq(propertyAgentAssignments.propertyId, propertyEmployeeAssignments.propertyId))
      .where(and(
        eq(propertyAgentAssignments.agentId, parseInt(agentId)),
        eq(properties.deleted, false),
        eq(propertyEmployeeAssignments.employeeId, employeeId)
      ));
    
    const assignedPropertyIds = assignments.map(a => a.propertyId);
    
    res.json({ data: assignedPropertyIds });
  } catch (error: any) {
    console.error('Error fetching agent assigned properties:', error);
    res.status(500).json({ message: 'Failed to fetch assigned properties' });
  }
};

export const assignPropertiesToAgent = async (req: AuthRequest, res: Response) => {
  try {
    const { id: agentId } = req.params;
    const employeeId = req.user!.userId;
    const { propertyIds, note } = assignPropertiesSchema.parse(req.body);
    
    const uniqueIds = [...new Set(propertyIds)];
    if (uniqueIds.length !== propertyIds.length) {
      return res.status(400).json({ message: 'Duplicate property IDs detected' });
    }
    
    const [agent] = await db.select()
      .from(users)
      .where(and(
        eq(users.id, parseInt(agentId)),
        or(eq(users.role, 'agent'), eq(users.role, 'Agent'))!,
        eq(users.assignedEmployeeId, employeeId),
        eq(users.approved, true),
        eq(users.deleted, false)
      ))
      .limit(1);
    
    if (!agent) {
      return res.status(403).json({ message: 'Agent not found or not assigned to you' });
    }
    
    const result = await dbTx.transaction(async (tx) => {
      // Get current assignments
      const currentAssignments = await tx
        .select({ propertyId: propertyAgentAssignments.propertyId })
        .from(propertyAgentAssignments)
        .innerJoin(properties, eq(propertyAgentAssignments.propertyId, properties.id))
        .innerJoin(propertyEmployeeAssignments, eq(propertyAgentAssignments.propertyId, propertyEmployeeAssignments.propertyId))
        .where(and(
          eq(propertyAgentAssignments.agentId, parseInt(agentId)),
          eq(properties.deleted, false),
          eq(propertyEmployeeAssignments.employeeId, employeeId)
        ));
      
      const currentIds = currentAssignments.map(a => a.propertyId);
      const toAdd = propertyIds.filter(id => !currentIds.includes(id));
      const toRemove = currentIds.filter(id => !propertyIds.includes(id));
      
      // Validate employee owns all properties being added
      if (toAdd.length > 0) {
        const propertiesToAdd = await tx
          .select()
          .from(properties)
          .where(and(
            inArray(properties.id, toAdd),
            eq(properties.deleted, false)
          ));
        
        if (propertiesToAdd.length !== toAdd.length) {
          throw new Error('Some properties not found');
        }
        
        // Check if properties are assigned to employee via junction table
        const employeePropertyAssignments = await tx
          .select({ propertyId: propertyEmployeeAssignments.propertyId })
          .from(propertyEmployeeAssignments)
          .where(and(
            eq(propertyEmployeeAssignments.employeeId, employeeId),
            inArray(propertyEmployeeAssignments.propertyId, toAdd)
          ));
        
        const assignedPropertyIds = employeePropertyAssignments.map(a => a.propertyId);
        const invalidProperties = propertiesToAdd.filter(
          p => !assignedPropertyIds.includes(p.id) && p.assignedEmployeeId !== employeeId
        );
        
        if (invalidProperties.length > 0) {
          throw new Error(`You do not own properties: ${invalidProperties.map(p => p.title).join(', ')}`);
        }
        
        // Add new assignments
        await tx.insert(propertyAgentAssignments)
          .values(toAdd.map(propertyId => ({
            propertyId,
            agentId: parseInt(agentId),
            assignedByEmployeeId: employeeId,
          })));
        
        // Update legacy field for newly added
        await tx.update(properties)
          .set({ assignedAgentId: parseInt(agentId), updatedAt: new Date() })
          .where(inArray(properties.id, toAdd));
      }
      
      // Remove assignments
      if (toRemove.length > 0) {
        await tx.delete(propertyAgentAssignments)
          .where(and(
            eq(propertyAgentAssignments.agentId, parseInt(agentId)),
            inArray(propertyAgentAssignments.propertyId, toRemove)
          ));
        
        // Clear legacy field
        await tx.update(properties)
          .set({ assignedAgentId: null, updatedAt: new Date() })
          .where(inArray(properties.id, toRemove));
      }
      
      return { added: toAdd.length, removed: toRemove.length };
    });
    
    emitAssignmentUpdate(parseInt(agentId), 'property', { totalAssignedChange: result.added - result.removed });
    emitAssignmentUpdate(employeeId, 'property', { totalAssignedChange: 0 });
    
    res.json(result);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    if (error.message?.includes('do not own') || error.message?.includes('not found')) {
      return res.status(403).json({ message: error.message });
    }
    console.error('Error updating property assignments:', error);
    res.status(500).json({ message: error.message || 'Failed to update assignments' });
  }
};
