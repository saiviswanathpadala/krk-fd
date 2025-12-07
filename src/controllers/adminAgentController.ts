import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { users } from '../models/user';
import { eq, and, or, ilike, desc, lt } from 'drizzle-orm';
import { auditService } from '../services/auditService';

interface AuthRequest extends Request {
  user?: {
    userId: number;
    role?: string;
  };
}

const listQuerySchema = z.object({
  status: z.enum(['approved', 'pending']).default('approved'),
  limit: z.string().transform(val => Math.min(parseInt(val) || 20, 100)),
  cursor: z.string().optional(),
  q: z.string().optional(),
  city: z.string().optional(),
});

const approveSchema = z.object({
  assign_to_employee_id: z.number().optional(),
}).optional();

const rejectSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
  action: z.enum(['delete', 'retain']).default('retain'),
});

const bulkDeleteSchema = z.object({
  ids: z.array(z.number()).max(100),
});

export const getAgents = async (req: AuthRequest, res: Response) => {
  try {
    const { status, limit, cursor, q, city } = listQuerySchema.parse(req.query);
    
    let whereConditions = [
      ilike(users.role, 'agent'),
      eq(users.deleted, false),
      eq(users.approved, status === 'approved')
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

    if (city) {
      whereConditions.push(ilike(users.city, `%${city}%`));
    }

    if (cursor) {
      whereConditions.push(lt(users.id, parseInt(cursor)));
    }

    const results = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      city: users.city,
      profileImgUrl: users.profileImgUrl,
      approved: users.approved,
      createdAt: users.createdAt,
      lastLogin: users.lastLogin,
    })
    .from(users)
    .where(and(...whereConditions))
    .orderBy(desc(users.id))
    .limit(limit + 1);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore ? results[limit - 1].id.toString() : null;

    res.json({ data, nextCursor, hasMore });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Get agents error:', error);
    res.status(500).json({ message: 'Failed to fetch agents' });
  }
};

export const getAgentById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const agentId = parseInt(id);

    if (isNaN(agentId)) {
      return res.status(400).json({ message: 'Invalid agent ID' });
    }

    const agent = await db.select()
      .from(users)
      .where(and(
        eq(users.id, agentId),
        ilike(users.role, 'agent'),
        eq(users.deleted, false)
      ))
      .limit(1);

    if (agent.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    const referredCustomers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      profileImgUrl: users.profileImgUrl,
    })
    .from(users)
    .where(and(
      eq(users.referredByAgentId, agentId),
      ilike(users.role, 'customer'),
      eq(users.deleted, false)
    ));

    res.json({
      ...agent[0],
      referredCustomers,
    });
  } catch (error) {
    console.error('Get agent by ID error:', error);
    res.status(500).json({ message: 'Failed to fetch agent details' });
  }
};

export const approveAgent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const agentId = parseInt(id);
    const adminId = req.user!.userId;
    const body = approveSchema.parse(req.body);
    const assign_to_employee_id = body?.assign_to_employee_id;

    if (isNaN(agentId)) {
      return res.status(400).json({ message: 'Invalid agent ID' });
    }

    const agent = await db.select()
      .from(users)
      .where(and(
        eq(users.id, agentId),
        ilike(users.role, 'agent'),
        eq(users.deleted, false)
      ))
      .limit(1);

    if (agent.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    if (agent[0].approved) {
      return res.status(400).json({ message: 'Agent already approved' });
    }

    const updateData: any = {
      approved: true,
      approvedAt: new Date(),
      rejectedReason: null,
      rejectedAt: null,
    };

    if (assign_to_employee_id) {
      updateData.assignedEmployeeId = assign_to_employee_id;
    }

    await db.update(users)
      .set(updateData)
      .where(eq(users.id, agentId));

    await auditService.log(
      adminId,
      'approve_agent',
      'user',
      agentId,
      {
        agentName: agent[0].name,
        agentEmail: agent[0].email,
        assignedEmployeeId: assign_to_employee_id,
      }
    );

    const updatedAgent = await db.select()
      .from(users)
      .where(eq(users.id, agentId))
      .limit(1);

    res.json(updatedAgent[0]);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Approve agent error:', error);
    res.status(500).json({ message: 'Failed to approve agent' });
  }
};

export const rejectAgent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const agentId = parseInt(id);
    const adminId = req.user!.userId;
    const { reason, action } = rejectSchema.parse(req.body);

    if (isNaN(agentId)) {
      return res.status(400).json({ message: 'Invalid agent ID' });
    }

    const agent = await db.select()
      .from(users)
      .where(and(
        eq(users.id, agentId),
        ilike(users.role, 'agent'),
        eq(users.deleted, false)
      ))
      .limit(1);

    if (agent.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    if (action === 'delete') {
      await db.update(users)
        .set({
          deleted: true,
          deletedAt: new Date(),
          deletedByAdminId: adminId,
        })
        .where(eq(users.id, agentId));

      await auditService.log(
        adminId,
        'reject_delete_agent',
        'user',
        agentId,
        { agentName: agent[0].name, reason }
      );

      return res.json({ success: true, actionTaken: 'deleted' });
    }

    await db.update(users)
      .set({
        approved: false,
        rejectedReason: reason,
        rejectedAt: new Date(),
      })
      .where(eq(users.id, agentId));

    await auditService.log(
      adminId,
      'reject_agent',
      'user',
      agentId,
      { agentName: agent[0].name, reason }
    );

    res.json({ success: true, actionTaken: 'flagged' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Reject agent error:', error);
    res.status(500).json({ message: 'Failed to reject agent' });
  }
};

export const deleteAgent = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const agentId = parseInt(id);
    const adminId = req.user!.userId;

    if (isNaN(agentId)) {
      return res.status(400).json({ message: 'Invalid agent ID' });
    }

    const agent = await db.select()
      .from(users)
      .where(and(
        eq(users.id, agentId),
        ilike(users.role, 'agent'),
        eq(users.deleted, false)
      ))
      .limit(1);

    if (agent.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }

    await db.update(users)
      .set({
        deleted: true,
        deletedAt: new Date(),
        deletedByAdminId: adminId,
      })
      .where(eq(users.id, agentId));

    await auditService.log(
      adminId,
      'delete_agent',
      'user',
      agentId,
      { agentName: agent[0].name }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({ message: 'Failed to delete agent' });
  }
};

export const bulkDeleteAgents = async (req: AuthRequest, res: Response) => {
  try {
    const { ids } = bulkDeleteSchema.parse(req.body);
    const adminId = req.user!.userId;

    if (ids.length === 0) {
      return res.status(400).json({ message: 'No agent IDs provided' });
    }

    const agentsToDelete = await db.select()
      .from(users)
      .where(and(
        ilike(users.role, 'agent'),
        eq(users.deleted, false)
      ));

    const validIds = agentsToDelete
      .filter(agent => ids.includes(agent.id))
      .map(agent => agent.id);

    const deleted: number[] = [];
    const failed: Array<{ id: number; reason: string }> = [];

    for (const id of ids) {
      try {
        if (!validIds.includes(id)) {
          failed.push({ id, reason: 'Agent not found or already deleted' });
          continue;
        }

        const agent = agentsToDelete.find(a => a.id === id);
        
        await db.update(users)
          .set({
            deleted: true,
            deletedAt: new Date(),
            deletedByAdminId: adminId,
          })
          .where(eq(users.id, id));

        await auditService.log(
          adminId,
          'bulk_delete_agent',
          'user',
          id,
          { agentName: agent?.name, bulkOperation: true }
        );

        deleted.push(id);
      } catch (error) {
        failed.push({ id, reason: 'Database error during deletion' });
      }
    }

    res.json({ deleted, failed });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Bulk delete agents error:', error);
    res.status(500).json({ message: 'Failed to delete agents' });
  }
};
