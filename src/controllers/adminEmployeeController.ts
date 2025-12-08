import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { users } from '../models/user';
import { properties } from '../models/property';
import { propertyEmployeeAssignments, propertyAgentAssignments } from '../models/propertyAssignment';
import { eq, and, or, ilike, desc, lt, sql, inArray } from 'drizzle-orm';
import { auditService } from '../services/auditService';

interface AuthRequest extends Request {
  user?: {
    userId: number;
    role?: string;
  };
}

const listQuerySchema = z.object({
  limit: z.string().transform(val => Math.min(parseInt(val) || 20, 100)),
  cursor: z.string().optional(),
  q: z.string().optional(),
  department: z.string().optional(),
});

const createEmployeeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Valid email is required'),
  phone: z.string().min(10, 'Valid phone is required'),
  department: z.string().min(1, 'Department is required'),
  assignProperties: z.array(z.string()).optional(),
  assignAgents: z.array(z.number()).optional(),
  invite: z.boolean().optional(),
});

const updateEmployeeSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
  addProperties: z.array(z.string()).optional(),
  removeProperties: z.array(z.string()).optional(),
  addAgents: z.array(z.number()).optional(),
  removeAgents: z.array(z.number()).optional(),
});

const reassignDeleteSchema = z.object({
  targetEmployeeId: z.number(),
});

export const getEmployees = async (req: AuthRequest, res: Response) => {
  try {
    const { limit, cursor, q, department } = listQuerySchema.parse(req.query);
    
    let whereConditions = [
      eq(users.role, 'employee'),
      eq(users.deleted, false),
    ];

    if (q) {
      const searchTerm = `%${q.toLowerCase()}%`;
      whereConditions.push(
        or(
          ilike(users.name, searchTerm),
          ilike(users.email, searchTerm),
          ilike(users.phone, searchTerm)
        )!
      );
    }

    if (department) {
      whereConditions.push(ilike(users.department, `%${department}%`));
    }

    if (cursor) {
      whereConditions.push(lt(users.id, parseInt(cursor)));
    }

    const results = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      department: users.department,
      profileImgUrl: users.profileImgUrl,
      lastLogin: users.lastLogin,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(...whereConditions))
    .orderBy(desc(users.id))
    .limit(limit + 1);

    const dataWithCounts = await Promise.all(results.map(async (user) => {
      const [propCount] = await db.select({ count: sql<number>`count(DISTINCT ${propertyEmployeeAssignments.propertyId})::int` })
        .from(propertyEmployeeAssignments)
        .innerJoin(properties, eq(propertyEmployeeAssignments.propertyId, properties.id))
        .where(and(
          eq(propertyEmployeeAssignments.employeeId, user.id),
          eq(properties.deleted, false)
        ));
      
      const [agentCount] = await db.select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(and(
          eq(users.assignedEmployeeId, user.id),
          ilike(users.role, 'agent'),
          eq(users.approved, true),
          eq(users.deleted, false)
        ));
      
      return {
        ...user,
        propertiesCount: propCount.count,
        agentsCount: agentCount.count,
      };
    }));

    const hasMore = dataWithCounts.length > limit;
    const data = hasMore ? dataWithCounts.slice(0, limit) : dataWithCounts;
    const nextCursor = hasMore ? dataWithCounts[limit - 1].id.toString() : null;

    res.json({ data, nextCursor, hasMore });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Get employees error:', error);
    res.status(500).json({ message: 'Failed to fetch employees' });
  }
};

export const getEmployeeById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employeeId = parseInt(id);

    if (isNaN(employeeId)) {
      return res.status(400).json({ message: 'Invalid employee ID' });
    }

    const employee = await db.select()
      .from(users)
      .where(and(
        eq(users.id, employeeId),
        ilike(users.role, 'employee'),
        eq(users.deleted, false)
      ))
      .limit(1);

    if (employee.length === 0) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const propertyAssignments = await db.select({
      propertyId: propertyEmployeeAssignments.propertyId,
    })
    .from(propertyEmployeeAssignments)
    .innerJoin(properties, eq(propertyEmployeeAssignments.propertyId, properties.id))
    .where(and(
      eq(propertyEmployeeAssignments.employeeId, employeeId),
      eq(properties.deleted, false)
    ));

    const propertyIds = propertyAssignments.map(pa => pa.propertyId);
    
    const assignedProperties = propertyIds.length > 0 ? await db.select({
      id: properties.id,
      title: properties.title,
      location: properties.location,
      images: properties.images,
    })
    .from(properties)
    .where(and(
      inArray(properties.id, propertyIds),
      eq(properties.deleted, false)
    )) : [];

    const assignedAgents = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      profileImgUrl: users.profileImgUrl,
    })
    .from(users)
    .where(and(
      eq(users.assignedEmployeeId, employeeId),
      ilike(users.role, 'agent'),
      eq(users.approved, true),
      eq(users.deleted, false)
    ));

    res.json({
      ...employee[0],
      assignedProperties,
      assignedAgents,
    });
  } catch (error) {
    console.error('Get employee by ID error:', error);
    res.status(500).json({ message: 'Failed to fetch employee details' });
  }
};

export const createEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.userId;
    const { name, email, phone, department, assignProperties, assignAgents, invite } = createEmployeeSchema.parse(req.body);

    const existingUser = await db.select()
      .from(users)
      .where(eq(users.phone, phone))
      .limit(1);

    if (existingUser.length > 0) {
      return res.status(400).json({ message: 'Phone number already exists' });
    }

    const [newEmployee] = await db.insert(users).values({
      name,
      email,
      phone,
      department,
      role: 'employee',
      approved: true,
      profileCompleted: true,
    }).returning();

    if (assignProperties && assignProperties.length > 0) {
      await db.insert(propertyEmployeeAssignments).values(
        assignProperties.map(propertyId => ({
          propertyId,
          employeeId: newEmployee.id,
          assignedByAdminId: adminId,
        }))
      ).onConflictDoNothing();
    }

    if (assignAgents && assignAgents.length > 0) {
      await db.update(users)
        .set({ assignedEmployeeId: newEmployee.id })
        .where(inArray(users.id, assignAgents));
    }

    await auditService.log(
      adminId,
      'create_employee',
      'user',
      newEmployee.id,
      {
        employeeName: name,
        department,
        propertiesAssigned: assignProperties?.length || 0,
        agentsAssigned: assignAgents?.length || 0,
      }
    );

    res.status(201).json(newEmployee);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Create employee error:', error);
    res.status(500).json({ message: 'Failed to create employee' });
  }
};

export const updateEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employeeId = parseInt(id);
    const adminId = req.user!.userId;
    const { name, email, phone, department, addProperties, removeProperties, addAgents, removeAgents } = updateEmployeeSchema.parse(req.body);

    if (isNaN(employeeId)) {
      return res.status(400).json({ message: 'Invalid employee ID' });
    }

    const employee = await db.select()
      .from(users)
      .where(and(
        eq(users.id, employeeId),
        ilike(users.role, 'employee'),
        eq(users.deleted, false)
      ))
      .limit(1);

    if (employee.length === 0) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const updateData: any = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (department) updateData.department = department;

    await db.update(users)
      .set(updateData)
      .where(eq(users.id, employeeId));

    if (addProperties && addProperties.length > 0) {
      await db.insert(propertyEmployeeAssignments).values(
        addProperties.map(propertyId => ({
          propertyId,
          employeeId,
          assignedByAdminId: adminId,
        }))
      ).onConflictDoNothing();
    }

    if (removeProperties && removeProperties.length > 0) {
      // Get agents assigned to this employee
      const employeeAgents = await db.select({ id: users.id })
        .from(users)
        .where(and(
          eq(users.assignedEmployeeId, employeeId),
          ilike(users.role, 'agent'),
          eq(users.deleted, false)
        ));
      
      const agentIds = employeeAgents.map(a => a.id);
      
      // Remove agent assignments for these properties
      if (agentIds.length > 0) {
        await db.delete(propertyAgentAssignments)
          .where(and(
            inArray(propertyAgentAssignments.propertyId, removeProperties),
            inArray(propertyAgentAssignments.agentId, agentIds)
          ));
      }
      
      // Remove employee assignments
      await db.delete(propertyEmployeeAssignments)
        .where(and(
          inArray(propertyEmployeeAssignments.propertyId, removeProperties),
          eq(propertyEmployeeAssignments.employeeId, employeeId)
        ));
    }

    if (addAgents && addAgents.length > 0) {
      await db.update(users)
        .set({ assignedEmployeeId: employeeId })
        .where(inArray(users.id, addAgents));
    }

    if (removeAgents && removeAgents.length > 0) {
      await db.update(users)
        .set({ assignedEmployeeId: null })
        .where(and(
          inArray(users.id, removeAgents),
          eq(users.assignedEmployeeId, employeeId)
        ));
    }

    await auditService.log(
      adminId,
      'update_employee',
      'user',
      employeeId,
      {
        employeeName: employee[0].name,
        changes: { name, email, phone, department },
        propertiesAdded: addProperties?.length || 0,
        propertiesRemoved: removeProperties?.length || 0,
        agentsAdded: addAgents?.length || 0,
        agentsRemoved: removeAgents?.length || 0,
      }
    );

    const updatedEmployee = await db.select()
      .from(users)
      .where(eq(users.id, employeeId))
      .limit(1);

    res.json(updatedEmployee[0]);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Update employee error:', error);
    res.status(500).json({ message: 'Failed to update employee' });
  }
};

export const reassignAndDeleteEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employeeId = parseInt(id);
    const adminId = req.user!.userId;
    const { targetEmployeeId } = reassignDeleteSchema.parse(req.body);

    if (isNaN(employeeId)) {
      return res.status(400).json({ message: 'Invalid employee ID' });
    }

    if (employeeId === targetEmployeeId) {
      return res.status(400).json({ message: 'Cannot reassign to the same employee' });
    }

    const employee = await db.select()
      .from(users)
      .where(and(
        eq(users.id, employeeId),
        ilike(users.role, 'employee'),
        eq(users.deleted, false)
      ))
      .limit(1);

    if (employee.length === 0) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const targetEmployee = await db.select()
      .from(users)
      .where(and(
        eq(users.id, targetEmployeeId),
        ilike(users.role, 'employee'),
        eq(users.deleted, false)
      ))
      .limit(1);

    if (targetEmployee.length === 0) {
      return res.status(404).json({ message: 'Target employee not found' });
    }

    const propertiesCount = await db.select({ count: sql<number>`count(DISTINCT ${propertyEmployeeAssignments.propertyId})` })
      .from(propertyEmployeeAssignments)
      .innerJoin(properties, eq(propertyEmployeeAssignments.propertyId, properties.id))
      .where(and(
        eq(propertyEmployeeAssignments.employeeId, employeeId),
        eq(properties.deleted, false)
      ));

    const agentsCount = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(
        eq(users.assignedEmployeeId, employeeId),
        ilike(users.role, 'agent'),
        eq(users.deleted, false)
      ));

    const propertiesToReassign = await db.select({ propertyId: propertyEmployeeAssignments.propertyId })
      .from(propertyEmployeeAssignments)
      .innerJoin(properties, eq(propertyEmployeeAssignments.propertyId, properties.id))
      .where(and(
        eq(propertyEmployeeAssignments.employeeId, employeeId),
        eq(properties.deleted, false)
      ));

    // Get agents assigned to this employee
    const employeeAgents = await db.select({ id: users.id })
      .from(users)
      .where(and(
        eq(users.assignedEmployeeId, employeeId),
        ilike(users.role, 'agent'),
        eq(users.deleted, false)
      ));
    
    const agentIds = employeeAgents.map(a => a.id);
    
    // Remove all agent assignments for this employee's properties
    if (agentIds.length > 0 && propertiesToReassign.length > 0) {
      const propertyIds = propertiesToReassign.map(p => p.propertyId);
      await db.delete(propertyAgentAssignments)
        .where(and(
          inArray(propertyAgentAssignments.propertyId, propertyIds),
          inArray(propertyAgentAssignments.agentId, agentIds)
        ));
    }
    
    // Get target employee's existing property assignments
    const targetEmployeeProperties = await db.select({ propertyId: propertyEmployeeAssignments.propertyId })
      .from(propertyEmployeeAssignments)
      .where(eq(propertyEmployeeAssignments.employeeId, targetEmployeeId));
    
    const targetPropertyIds = targetEmployeeProperties.map(p => p.propertyId);
    
    // Filter out properties that target employee already has
    const uniquePropertiesToReassign = propertiesToReassign.filter(
      p => !targetPropertyIds.includes(p.propertyId)
    );
    
    await db.delete(propertyEmployeeAssignments)
      .where(eq(propertyEmployeeAssignments.employeeId, employeeId));

    if (uniquePropertiesToReassign.length > 0) {
      await db.insert(propertyEmployeeAssignments).values(
        uniquePropertiesToReassign.map(p => ({
          propertyId: p.propertyId,
          employeeId: targetEmployeeId,
          assignedByAdminId: adminId,
        }))
      );
    }

    await db.update(users)
      .set({ assignedEmployeeId: targetEmployeeId })
      .where(eq(users.assignedEmployeeId, employeeId));

    await db.update(users)
      .set({
        deleted: true,
        deletedAt: new Date(),
        deletedByAdminId: adminId,
      })
      .where(eq(users.id, employeeId));

    await auditService.log(
      adminId,
      'reassign_delete_employee',
      'user',
      employeeId,
      {
        employeeName: employee[0].name,
        targetEmployeeName: targetEmployee[0].name,
        propertiesReassigned: uniquePropertiesToReassign.length,
        propertiesSkipped: propertiesToReassign.length - uniquePropertiesToReassign.length,
        agentsReassigned: agentsCount[0].count,
      }
    );

    res.json({
      success: true,
      reassigned: {
        properties: uniquePropertiesToReassign.length,
        propertiesSkipped: propertiesToReassign.length - uniquePropertiesToReassign.length,
        agents: agentsCount[0].count,
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Reassign and delete employee error:', error);
    res.status(500).json({ message: 'Failed to reassign and delete employee' });
  }
};

export const deleteEmployee = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employeeId = parseInt(id);
    const adminId = req.user!.userId;

    if (isNaN(employeeId)) {
      return res.status(400).json({ message: 'Invalid employee ID' });
    }

    const employee = await db.select()
      .from(users)
      .where(and(
        eq(users.id, employeeId),
        ilike(users.role, 'employee'),
        eq(users.deleted, false)
      ))
      .limit(1);

    if (employee.length === 0) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    const propertiesCount = await db.select({ count: sql<number>`count(DISTINCT ${propertyEmployeeAssignments.propertyId})` })
      .from(propertyEmployeeAssignments)
      .innerJoin(properties, eq(propertyEmployeeAssignments.propertyId, properties.id))
      .where(and(
        eq(propertyEmployeeAssignments.employeeId, employeeId),
        eq(properties.deleted, false)
      ));

    const agentsCount = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(
        eq(users.assignedEmployeeId, employeeId),
        ilike(users.role, 'agent'),
        eq(users.deleted, false)
      ));

    if (propertiesCount[0].count > 0 || agentsCount[0].count > 0) {
      return res.status(400).json({
        message: 'Cannot delete employee with assignments',
        propertiesCount: propertiesCount[0].count,
        agentsCount: agentsCount[0].count,
      });
    }

    await db.update(users)
      .set({
        deleted: true,
        deletedAt: new Date(),
        deletedByAdminId: adminId,
      })
      .where(eq(users.id, employeeId));

    await auditService.log(
      adminId,
      'delete_employee',
      'user',
      employeeId,
      { employeeName: employee[0].name }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({ message: 'Failed to delete employee' });
  }
};

export const getPropertiesLookup = async (req: AuthRequest, res: Response) => {
  try {
    const { q, limit = '50' } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 50, 100);

    let whereConditions = [eq(properties.deleted, false)];

    if (q) {
      const searchTerm = `%${q}%`;
      whereConditions.push(
        or(
          ilike(properties.title, searchTerm),
          ilike(properties.location, searchTerm)
        )!
      );
    }

    const results = await db.select({
      id: properties.id,
      title: properties.title,
      location: properties.location,
      images: properties.images,
    })
    .from(properties)
    .where(and(...whereConditions))
    .limit(limitNum);

    res.json({ data: results });
  } catch (error) {
    console.error('Get properties lookup error:', error);
    res.status(500).json({ message: 'Failed to fetch properties' });
  }
};

export const getAgentsLookup = async (req: AuthRequest, res: Response) => {
  try {
    const { q, limit = '50' } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 50, 100);

    let whereConditions = [
      ilike(users.role, 'agent'),
      eq(users.approved, true),
      eq(users.deleted, false),
    ];

    if (q) {
      const searchTerm = `%${q}%`;
      whereConditions.push(
        or(
          ilike(users.name, searchTerm),
          ilike(users.email, searchTerm),
          ilike(users.phone, searchTerm)
        )!
      );
    }

    const results = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      profileImgUrl: users.profileImgUrl,
      assignedEmployeeId: users.assignedEmployeeId,
    })
    .from(users)
    .where(and(...whereConditions))
    .limit(limitNum);

    const resultsWithEmployeeNames = await Promise.all(results.map(async (agent) => {
      if (agent.assignedEmployeeId) {
        const [employee] = await db.select({ name: users.name })
          .from(users)
          .where(eq(users.id, agent.assignedEmployeeId))
          .limit(1);
        return { ...agent, assignedEmployeeName: employee?.name };
      }
      return agent;
    }));

    res.json({ data: resultsWithEmployeeNames });
  } catch (error) {
    console.error('Get agents lookup error:', error);
    res.status(500).json({ message: 'Failed to fetch agents' });
  }
};
