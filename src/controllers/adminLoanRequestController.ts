import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { loanRequests, loanRequestComments, loanRequestAssignments, loanRequestAuditLogs } from '../models/loanRequest';
import { users } from '../models/user';
import { exportJobs, adminSlaConfigs } from '../models/exportJob';
import { eq, and, desc, isNull, or, ilike, sql, count, gte, lte, inArray } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: { userId: number; role?: string };
}

const createAuditLog = async (loanRequestId: string, actorId: number, action: string, oldValue?: string, newValue?: string, comment?: string) => {
  await db.insert(loanRequestAuditLogs).values({
    loanRequestId,
    actorId,
    action,
    oldValue: oldValue || null,
    newValue: newValue || null,
    comment: comment || null,
  });
};

export const getAdminLoanRequests = async (req: AuthRequest, res: Response) => {
  try {
    const { status, assignee, priority, slaState, search, startDate, endDate, limit = '20', cursor, sort = 'newest' } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);

    let whereConditions = [isNull(loanRequests.deletedAt)];

    if (status && status !== 'all') whereConditions.push(eq(loanRequests.status, status as string));
    if (assignee === 'unassigned') whereConditions.push(isNull(loanRequests.assigneeId));
    else if (assignee && assignee !== 'all') whereConditions.push(eq(loanRequests.assigneeId, parseInt(assignee as string)));
    if (priority && priority !== 'all') whereConditions.push(eq(loanRequests.priority, priority as string));
    if (slaState === 'overdue') whereConditions.push(sql`${loanRequests.slaDueAt} < NOW()`);
    if (startDate) whereConditions.push(gte(loanRequests.createdAt, new Date(startDate as string)));
    if (endDate) whereConditions.push(lte(loanRequests.createdAt, new Date(endDate as string)));

    if (search && typeof search === 'string') {
      whereConditions.push(
        or(
          ilike(loanRequests.userName, `%${search}%`),
          ilike(loanRequests.userPhone, `%${search}%`),
          ilike(loanRequests.userEmail, `%${search}%`),
          sql`CAST(${loanRequests.id} AS TEXT) ILIKE ${`%${search}%`}`
        )!
      );
    }

    let orderBy;
    if (sort === 'oldest') orderBy = loanRequests.createdAt;
    else if (sort === 'highest') orderBy = desc(loanRequests.loanAmountNeeded);
    else if (sort === 'sla') orderBy = loanRequests.slaDueAt;
    else orderBy = desc(loanRequests.createdAt);

    const results = await db
      .select({
        id: loanRequests.id,
        userName: loanRequests.userName,
        userPhone: loanRequests.userPhone,
        userEmail: loanRequests.userEmail,
        loanType: loanRequests.loanType,
        loanAmountNeeded: loanRequests.loanAmountNeeded,
        propertyCategory: loanRequests.propertyCategory,
        status: loanRequests.status,
        priority: loanRequests.priority,
        assigneeId: loanRequests.assigneeId,
        slaDueAt: loanRequests.slaDueAt,
        lastActivityAt: loanRequests.lastActivityAt,
        isEscalated: loanRequests.isEscalated,
        createdAt: loanRequests.createdAt,
        assigneeName: users.name,
      })
      .from(loanRequests)
      .leftJoin(users, eq(loanRequests.assigneeId, users.id))
      .where(and(...whereConditions))
      .orderBy(orderBy)
      .limit(limitNum + 1);

    const hasMore = results.length > limitNum;
    const data = hasMore ? results.slice(0, limitNum) : results;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    res.json({ data, nextCursor, hasMore });
  } catch (error) {
    console.error('Get admin loan requests error:', error);
    res.status(500).json({ message: 'Failed to fetch loan requests' });
  }
};

export const getAdminLoanRequestById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [loanRequest] = await db.select().from(loanRequests).where(and(eq(loanRequests.id, id), isNull(loanRequests.deletedAt))).limit(1);
    if (!loanRequest) return res.status(404).json({ message: 'Loan request not found' });

    const assignee = loanRequest.assigneeId ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, loanRequest.assigneeId)).limit(1) : [];

    const comments = await db
      .select({ id: loanRequestComments.id, text: loanRequestComments.text, isPublic: loanRequestComments.isPublic, createdAt: loanRequestComments.createdAt, authorId: loanRequestComments.authorId, authorName: users.name })
      .from(loanRequestComments)
      .leftJoin(users, eq(loanRequestComments.authorId, users.id))
      .where(eq(loanRequestComments.loanRequestId, id))
      .orderBy(loanRequestComments.createdAt);

    const auditLogs = await db
      .select({ id: loanRequestAuditLogs.id, action: loanRequestAuditLogs.action, oldValue: loanRequestAuditLogs.oldValue, newValue: loanRequestAuditLogs.newValue, comment: loanRequestAuditLogs.comment, createdAt: loanRequestAuditLogs.createdAt, actorId: loanRequestAuditLogs.actorId, actorName: users.name })
      .from(loanRequestAuditLogs)
      .leftJoin(users, eq(loanRequestAuditLogs.actorId, users.id))
      .where(eq(loanRequestAuditLogs.loanRequestId, id))
      .orderBy(loanRequestAuditLogs.createdAt);

    res.json({ loanRequest: { ...loanRequest, assignee: assignee[0] || null }, comments, auditLogs });
  } catch (error) {
    console.error('Get admin loan request by id error:', error);
    res.status(500).json({ message: 'Failed to fetch loan request' });
  }
};

export const reassignLoanRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.user!.userId;
    const { assigneeId, comment, autoAssign } = z.object({
      assigneeId: z.number().optional(),
      comment: z.string().max(500).optional(),
      autoAssign: z.boolean().optional(),
    }).parse(req.body);

    if (!assigneeId && !autoAssign) return res.status(400).json({ message: 'assigneeId or autoAssign required' });

    const [existing] = await db.select().from(loanRequests).where(and(eq(loanRequests.id, id), isNull(loanRequests.deletedAt))).limit(1);
    if (!existing) return res.status(404).json({ message: 'Loan request not found' });

    let targetAssigneeId = assigneeId;
    if (autoAssign) {
      const financeEmployees = await db
        .select({ id: users.id, openTickets: sql<number>`COUNT(${loanRequests.id})` })
        .from(users)
        .leftJoin(loanRequests, and(eq(loanRequests.assigneeId, users.id), isNull(loanRequests.deletedAt), sql`${loanRequests.status} NOT IN ('closed', 'rejected')`))
        .where(and(eq(users.role, 'employee'), eq(users.department, 'Finance'), eq(users.active, true)))
        .groupBy(users.id)
        .orderBy(sql`COUNT(${loanRequests.id})`)
        .limit(1);

      if (!financeEmployees.length) return res.status(400).json({ message: 'No active finance employees available' });
      targetAssigneeId = financeEmployees[0].id;
    }

    const [assignee] = await db.select().from(users).where(and(eq(users.id, targetAssigneeId!), eq(users.role, 'employee'), eq(users.department, 'Finance'), eq(users.active, true))).limit(1);
    if (!assignee) return res.status(400).json({ message: 'Invalid assignee' });

    const [updated] = await db
      .update(loanRequests)
      .set({ assigneeId: targetAssigneeId, status: existing.status === 'received' ? 'under_review' : existing.status, lastActivityAt: new Date(), version: sql`${loanRequests.version} + 1`, updatedAt: new Date() })
      .where(and(eq(loanRequests.id, id), eq(loanRequests.version, existing.version)))
      .returning();

    if (!updated) {
      const [current] = await db.select().from(loanRequests).where(eq(loanRequests.id, id)).limit(1);
      return res.status(409).json({ message: 'Loan request was modified', loanRequest: current });
    }

    await db.insert(loanRequestAssignments).values({ loanRequestId: id, assignedById: adminId, assigneeId: targetAssigneeId!, comment: comment || (autoAssign ? 'Auto-assigned' : 'Reassigned by admin') });
    await createAuditLog(id, adminId, 'reassigned', existing.assigneeId?.toString(), targetAssigneeId!.toString(), comment);

    console.log(`📋 Admin ${adminId} reassigned loan request ${id} to ${targetAssigneeId}`);
    res.json({ success: true, loanRequest: updated });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues[0].message });
    console.error('Reassign loan request error:', error);
    res.status(500).json({ message: 'Failed to reassign' });
  }
};

export const bulkReassignLoanRequests = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.userId;
    const { ids, assigneeId, autoAssign } = z.object({
      ids: z.array(z.string()).min(1).max(100),
      assigneeId: z.number().optional(),
      autoAssign: z.boolean().optional(),
    }).parse(req.body);

    if (!assigneeId && !autoAssign) return res.status(400).json({ message: 'assigneeId or autoAssign required' });

    let targetAssigneeId = assigneeId;
    if (autoAssign) {
      const [leastBusy] = await db
        .select({ id: users.id })
        .from(users)
        .leftJoin(loanRequests, and(eq(loanRequests.assigneeId, users.id), isNull(loanRequests.deletedAt), sql`${loanRequests.status} NOT IN ('closed', 'rejected')`))
        .where(and(eq(users.role, 'employee'), eq(users.department, 'Finance'), eq(users.active, true)))
        .groupBy(users.id)
        .orderBy(sql`COUNT(${loanRequests.id})`)
        .limit(1);
      if (!leastBusy) return res.status(400).json({ message: 'No active finance employees' });
      targetAssigneeId = leastBusy.id;
    }

    const updated = await db
      .update(loanRequests)
      .set({ assigneeId: targetAssigneeId, lastActivityAt: new Date(), updatedAt: new Date() })
      .where(and(inArray(loanRequests.id, ids), isNull(loanRequests.deletedAt)))
      .returning({ id: loanRequests.id });

    for (const ticket of updated) {
      await db.insert(loanRequestAssignments).values({ loanRequestId: ticket.id, assignedById: adminId, assigneeId: targetAssigneeId!, comment: 'Bulk reassigned' });
      await createAuditLog(ticket.id, adminId, 'bulk_reassigned', undefined, targetAssigneeId!.toString());
    }

    console.log(`📋 Admin ${adminId} bulk reassigned ${updated.length} tickets to ${targetAssigneeId}`);
    res.json({ success: true, count: updated.length });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues[0].message });
    console.error('Bulk reassign error:', error);
    res.status(500).json({ message: 'Failed to bulk reassign' });
  }
};

export const escalateLoanRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.user!.userId;
    const { reason } = z.object({ reason: z.string().min(10).max(500) }).parse(req.body);

    const [existing] = await db.select().from(loanRequests).where(and(eq(loanRequests.id, id), isNull(loanRequests.deletedAt))).limit(1);
    if (!existing) return res.status(404).json({ message: 'Loan request not found' });

    const [updated] = await db
      .update(loanRequests)
      .set({ isEscalated: true, escalationReason: reason, priority: 'high', lastActivityAt: new Date(), version: sql`${loanRequests.version} + 1`, updatedAt: new Date() })
      .where(and(eq(loanRequests.id, id), eq(loanRequests.version, existing.version)))
      .returning();

    if (!updated) {
      const [current] = await db.select().from(loanRequests).where(eq(loanRequests.id, id)).limit(1);
      return res.status(409).json({ message: 'Loan request was modified', loanRequest: current });
    }

    await createAuditLog(id, adminId, 'escalated', undefined, 'high', reason);
    console.log(`📋 Admin ${adminId} escalated loan request ${id}`);
    res.json({ success: true, loanRequest: updated });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues[0].message });
    console.error('Escalate error:', error);
    res.status(500).json({ message: 'Failed to escalate' });
  }
};

export const bulkEscalateLoanRequests = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.userId;
    const { ids, reason } = z.object({ ids: z.array(z.string()).min(1).max(100), reason: z.string().min(10).max(500) }).parse(req.body);

    const updated = await db
      .update(loanRequests)
      .set({ isEscalated: true, escalationReason: reason, priority: 'high', lastActivityAt: new Date(), updatedAt: new Date() })
      .where(and(inArray(loanRequests.id, ids), isNull(loanRequests.deletedAt)))
      .returning({ id: loanRequests.id });

    for (const ticket of updated) {
      await createAuditLog(ticket.id, adminId, 'bulk_escalated', undefined, 'high', reason);
    }

    console.log(`📋 Admin ${adminId} bulk escalated ${updated.length} tickets`);
    res.json({ success: true, count: updated.length });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues[0].message });
    console.error('Bulk escalate error:', error);
    res.status(500).json({ message: 'Failed to bulk escalate' });
  }
};

export const changeAdminLoanRequestStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.user!.userId;
    const { status, comment } = z.object({
      status: z.enum(['received', 'under_review', 'contacted', 'closed', 'rejected']),
      comment: z.string().max(1000).optional(),
    }).parse(req.body);

    if ((status === 'closed' || status === 'rejected') && !comment) return res.status(400).json({ message: 'Comment required for close/reject' });

    const [existing] = await db.select().from(loanRequests).where(and(eq(loanRequests.id, id), isNull(loanRequests.deletedAt))).limit(1);
    if (!existing) return res.status(404).json({ message: 'Loan request not found' });

    const [updated] = await db
      .update(loanRequests)
      .set({ status, lastActivityAt: new Date(), version: sql`${loanRequests.version} + 1`, updatedAt: new Date() })
      .where(and(eq(loanRequests.id, id), eq(loanRequests.version, existing.version)))
      .returning();

    if (!updated) {
      const [current] = await db.select().from(loanRequests).where(eq(loanRequests.id, id)).limit(1);
      return res.status(409).json({ message: 'Loan request was modified', loanRequest: current });
    }

    await createAuditLog(id, adminId, 'status_change', existing.status, status, comment);
    console.log(`📋 Admin ${adminId} changed loan request ${id} status to ${status}`);
    res.json({ success: true, loanRequest: updated });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues[0].message });
    console.error('Change status error:', error);
    res.status(500).json({ message: 'Failed to change status' });
  }
};

export const addAdminLoanRequestComment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = req.user!.userId;
    const { text, isPublic = false } = z.object({ text: z.string().min(1).max(1000), isPublic: z.boolean().optional() }).parse(req.body);

    const [existing] = await db.select().from(loanRequests).where(and(eq(loanRequests.id, id), isNull(loanRequests.deletedAt))).limit(1);
    if (!existing) return res.status(404).json({ message: 'Loan request not found' });

    const [comment] = await db.insert(loanRequestComments).values({ loanRequestId: id, authorId: adminId, text, isPublic }).returning();
    await db.update(loanRequests).set({ lastActivityAt: new Date() }).where(eq(loanRequests.id, id));
    await createAuditLog(id, adminId, 'comment_added', undefined, text.substring(0, 100));

    const [author] = await db.select({ name: users.name }).from(users).where(eq(users.id, adminId)).limit(1);
    res.json({ success: true, comment: { ...comment, authorName: author?.name || 'Admin' } });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues[0].message });
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Failed to add comment' });
  }
};

export const requestExport = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.userId;
    const filters = req.body;

    const [job] = await db.insert(exportJobs).values({ jobType: 'loan_requests_csv', requestedBy: adminId, filters, status: 'pending' }).returning();

    console.log(`📋 Admin ${adminId} requested export job ${job.id}`);
    res.json({ success: true, jobId: job.id, message: 'Export queued. You will be notified when ready.' });
  } catch (error) {
    console.error('Request export error:', error);
    res.status(500).json({ message: 'Failed to request export' });
  }
};

export const getAdminLoanRequestStats = async (req: AuthRequest, res: Response) => {
  try {
    const [totalCount] = await db.select({ count: count() }).from(loanRequests).where(isNull(loanRequests.deletedAt));
    const [unassignedCount] = await db.select({ count: count() }).from(loanRequests).where(and(isNull(loanRequests.assigneeId), isNull(loanRequests.deletedAt)));
    const [escalatedCount] = await db.select({ count: count() }).from(loanRequests).where(and(eq(loanRequests.isEscalated, true), isNull(loanRequests.deletedAt)));
    const [overdueCount] = await db.select({ count: count() }).from(loanRequests).where(and(sql`${loanRequests.slaDueAt} < NOW()`, sql`${loanRequests.status} NOT IN ('closed', 'rejected')`, isNull(loanRequests.deletedAt)));

    const statusCounts = await db
      .select({ status: loanRequests.status, count: count() })
      .from(loanRequests)
      .where(isNull(loanRequests.deletedAt))
      .groupBy(loanRequests.status);

    const byStatus = statusCounts.reduce((acc, { status, count }) => ({ ...acc, [status]: count }), {});

    res.json({ total: totalCount.count, unassigned: unassignedCount.count, escalated: escalatedCount.count, overdue: overdueCount.count, byStatus });
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
};

export const getFinanceEmployees = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    let whereConditions = [eq(users.role, 'employee'), eq(users.department, 'Finance'), eq(users.active, true)];
    if (q && typeof q === 'string') whereConditions.push(or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`))!);

    const employees = await db
      .select({ id: users.id, name: users.name, email: users.email, openTickets: sql<number>`COUNT(${loanRequests.id})` })
      .from(users)
      .leftJoin(loanRequests, and(eq(loanRequests.assigneeId, users.id), isNull(loanRequests.deletedAt), sql`${loanRequests.status} NOT IN ('closed', 'rejected')`))
      .where(and(...whereConditions))
      .groupBy(users.id, users.name, users.email)
      .orderBy(users.name)
      .limit(50);

    res.json({ data: employees });
  } catch (error) {
    console.error('Get finance employees error:', error);
    res.status(500).json({ message: 'Failed to fetch employees' });
  }
};

export const getSlaConfig = async (req: AuthRequest, res: Response) => {
  try {
    const [config] = await db.select().from(adminSlaConfigs).where(eq(adminSlaConfigs.configKey, 'loan_request_sla_hours')).limit(1);
    res.json({ config: config || { configKey: 'loan_request_sla_hours', configValue: { hours: 24 } } });
  } catch (error) {
    console.error('Get SLA config error:', error);
    res.status(500).json({ message: 'Failed to fetch SLA config' });
  }
};

export const updateSlaConfig = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.user!.userId;
    const { hours } = z.object({ hours: z.number().min(1).max(168) }).parse(req.body);

    const [updated] = await db
      .update(adminSlaConfigs)
      .set({ configValue: { hours }, updatedBy: adminId, updatedAt: new Date() })
      .where(eq(adminSlaConfigs.configKey, 'loan_request_sla_hours'))
      .returning();

    console.log(`📋 Admin ${adminId} updated SLA config to ${hours} hours`);
    res.json({ success: true, config: updated });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues[0].message });
    console.error('Update SLA config error:', error);
    res.status(500).json({ message: 'Failed to update SLA config' });
  }
};
