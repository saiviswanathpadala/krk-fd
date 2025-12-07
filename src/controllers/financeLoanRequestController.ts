import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { loanRequests, loanRequestComments, loanRequestAssignments, loanRequestAuditLogs } from '../models/loanRequest';
import { users } from '../models/user';
import { eq, and, desc, isNull, or, ilike, sql, count } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: {
    userId: number;
    role?: string;
  };
}

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  received: ['under_review', 'rejected'],
  under_review: ['contacted', 'rejected'],
  contacted: ['closed', 'rejected'],
};

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

export const getFinanceLoanRequests = async (req: AuthRequest, res: Response) => {
  try {
    const financeId = req.user!.userId;
    const { status, assignee, search, limit = '20', cursor, sort = 'newest' } = req.query;
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);

    let whereConditions = [isNull(loanRequests.deletedAt)];

    if (status && status !== 'all') {
      whereConditions.push(eq(loanRequests.status, status as string));
    }

    if (assignee === 'me') {
      whereConditions.push(eq(loanRequests.assigneeId, financeId));
    } else if (assignee === 'unassigned') {
      whereConditions.push(isNull(loanRequests.assigneeId));
    }

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
    if (sort === 'oldest') {
      orderBy = loanRequests.createdAt;
    } else if (sort === 'highest') {
      orderBy = desc(loanRequests.loanAmountNeeded);
    } else if (sort === 'sla') {
      orderBy = loanRequests.slaDueAt;
    } else {
      orderBy = desc(loanRequests.createdAt);
    }

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
        assigneeId: loanRequests.assigneeId,
        slaDueAt: loanRequests.slaDueAt,
        lastActivityAt: loanRequests.lastActivityAt,
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
    console.error('Get finance loan requests error:', error);
    res.status(500).json({ message: 'Failed to fetch loan requests' });
  }
};

export const getFinanceLoanRequestById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const [loanRequest] = await db
      .select()
      .from(loanRequests)
      .where(and(eq(loanRequests.id, id), isNull(loanRequests.deletedAt)))
      .limit(1);

    if (!loanRequest) {
      return res.status(404).json({ message: 'Loan request not found' });
    }

    const assignee = loanRequest.assigneeId
      ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, loanRequest.assigneeId)).limit(1)
      : [];

    const comments = await db
      .select({
        id: loanRequestComments.id,
        text: loanRequestComments.text,
        isPublic: loanRequestComments.isPublic,
        createdAt: loanRequestComments.createdAt,
        authorId: loanRequestComments.authorId,
        authorName: users.name,
      })
      .from(loanRequestComments)
      .leftJoin(users, eq(loanRequestComments.authorId, users.id))
      .where(eq(loanRequestComments.loanRequestId, id))
      .orderBy(loanRequestComments.createdAt);

    const auditLogs = await db
      .select({
        id: loanRequestAuditLogs.id,
        action: loanRequestAuditLogs.action,
        oldValue: loanRequestAuditLogs.oldValue,
        newValue: loanRequestAuditLogs.newValue,
        comment: loanRequestAuditLogs.comment,
        createdAt: loanRequestAuditLogs.createdAt,
        actorId: loanRequestAuditLogs.actorId,
        actorName: users.name,
      })
      .from(loanRequestAuditLogs)
      .leftJoin(users, eq(loanRequestAuditLogs.actorId, users.id))
      .where(eq(loanRequestAuditLogs.loanRequestId, id))
      .orderBy(loanRequestAuditLogs.createdAt);

    res.json({
      loanRequest: {
        ...loanRequest,
        assignee: assignee[0] || null,
      },
      comments,
      auditLogs,
    });
  } catch (error) {
    console.error('Get loan request by id error:', error);
    res.status(500).json({ message: 'Failed to fetch loan request' });
  }
};

export const takeLoanRequest = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const financeId = req.user!.userId;

    const [existing] = await db
      .select()
      .from(loanRequests)
      .where(and(eq(loanRequests.id, id), isNull(loanRequests.deletedAt)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Loan request not found' });
    }

    if (existing.assigneeId && existing.assigneeId !== financeId) {
      const [assignee] = await db.select({ name: users.name }).from(users).where(eq(users.id, existing.assigneeId)).limit(1);
      return res.status(409).json({
        message: `Already assigned to ${assignee?.name || 'another user'}`,
        loanRequest: existing,
      });
    }

    const [updated] = await db
      .update(loanRequests)
      .set({
        assigneeId: financeId,
        status: 'under_review',
        lastActivityAt: new Date(),
        version: sql`${loanRequests.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(loanRequests.id, id), eq(loanRequests.version, existing.version)))
      .returning();

    if (!updated) {
      const [current] = await db.select().from(loanRequests).where(eq(loanRequests.id, id)).limit(1);
      return res.status(409).json({
        message: 'Loan request was modified by another user',
        loanRequest: current,
      });
    }

    await db.insert(loanRequestAssignments).values({
      loanRequestId: id,
      assignedById: financeId,
      assigneeId: financeId,
      comment: 'Self-assigned',
    });

    await createAuditLog(id, financeId, 'assigned', undefined, financeId.toString(), 'Self-assigned');
    await createAuditLog(id, financeId, 'status_change', existing.status, 'under_review');

    console.log(`📋 Loan request ${id} taken by finance employee ${financeId}`);

    res.json({ success: true, loanRequest: updated });
  } catch (error) {
    console.error('Take loan request error:', error);
    res.status(500).json({ message: 'Failed to take loan request' });
  }
};

export const updateLoanRequestStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const financeId = req.user!.userId;
    const { status, comment } = z.object({
      status: z.enum(['received', 'under_review', 'contacted', 'closed', 'rejected']),
      comment: z.string().max(1000).optional(),
    }).parse(req.body);

    if ((status === 'closed' || status === 'rejected') && !comment) {
      return res.status(400).json({ message: 'Comment is required for closed or rejected status' });
    }

    const [existing] = await db
      .select()
      .from(loanRequests)
      .where(and(eq(loanRequests.id, id), isNull(loanRequests.deletedAt)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Loan request not found' });
    }

    const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[existing.status] || [];
    if (!allowedTransitions.includes(status)) {
      return res.status(400).json({
        message: `Cannot transition from ${existing.status} to ${status}`,
        allowedTransitions,
      });
    }

    const [updated] = await db
      .update(loanRequests)
      .set({
        status,
        lastActivityAt: new Date(),
        version: sql`${loanRequests.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(loanRequests.id, id), eq(loanRequests.version, existing.version)))
      .returning();

    if (!updated) {
      const [current] = await db.select().from(loanRequests).where(eq(loanRequests.id, id)).limit(1);
      return res.status(409).json({
        message: 'Loan request was modified by another user',
        loanRequest: current,
      });
    }

    await createAuditLog(id, financeId, 'status_change', existing.status, status, comment);

    console.log(`📋 Loan request ${id} status changed from ${existing.status} to ${status} by ${financeId}`);

    res.json({ success: true, loanRequest: updated });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Update loan request status error:', error);
    res.status(500).json({ message: 'Failed to update status' });
  }
};

export const addLoanRequestComment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const financeId = req.user!.userId;
    const { text, isPublic = false } = z.object({
      text: z.string().min(1).max(1000),
      isPublic: z.boolean().optional(),
    }).parse(req.body);

    const [existing] = await db
      .select()
      .from(loanRequests)
      .where(and(eq(loanRequests.id, id), isNull(loanRequests.deletedAt)))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: 'Loan request not found' });
    }

    const [comment] = await db.insert(loanRequestComments).values({
      loanRequestId: id,
      authorId: financeId,
      text,
      isPublic,
    }).returning();

    await db
      .update(loanRequests)
      .set({ lastActivityAt: new Date() })
      .where(eq(loanRequests.id, id));

    await createAuditLog(id, financeId, 'comment_added', undefined, text.substring(0, 100));

    const [author] = await db.select({ name: users.name }).from(users).where(eq(users.id, financeId)).limit(1);

    res.json({
      success: true,
      comment: {
        ...comment,
        authorName: author?.name || 'Unknown',
      },
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Add comment error:', error);
    res.status(500).json({ message: 'Failed to add comment' });
  }
};

export const getFinanceLoanRequestStats = async (req: AuthRequest, res: Response) => {
  try {
    const financeId = req.user!.userId;

    const [totalCount] = await db
      .select({ count: count() })
      .from(loanRequests)
      .where(isNull(loanRequests.deletedAt));

    const [myCount] = await db
      .select({ count: count() })
      .from(loanRequests)
      .where(and(eq(loanRequests.assigneeId, financeId), isNull(loanRequests.deletedAt)));

    const [unassignedCount] = await db
      .select({ count: count() })
      .from(loanRequests)
      .where(and(isNull(loanRequests.assigneeId), isNull(loanRequests.deletedAt)));

    const [receivedCount] = await db
      .select({ count: count() })
      .from(loanRequests)
      .where(and(eq(loanRequests.status, 'received'), isNull(loanRequests.deletedAt)));

    const [underReviewCount] = await db
      .select({ count: count() })
      .from(loanRequests)
      .where(and(eq(loanRequests.status, 'under_review'), isNull(loanRequests.deletedAt)));

    const [contactedCount] = await db
      .select({ count: count() })
      .from(loanRequests)
      .where(and(eq(loanRequests.status, 'contacted'), isNull(loanRequests.deletedAt)));

    const [closedCount] = await db
      .select({ count: count() })
      .from(loanRequests)
      .where(and(eq(loanRequests.status, 'closed'), isNull(loanRequests.deletedAt)));

    res.json({
      total: totalCount.count,
      myTickets: myCount.count,
      unassigned: unassignedCount.count,
      byStatus: {
        received: receivedCount.count,
        under_review: underReviewCount.count,
        contacted: contactedCount.count,
        closed: closedCount.count,
      },
    });
  } catch (error) {
    console.error('Get finance stats error:', error);
    res.status(500).json({ message: 'Failed to fetch stats' });
  }
};
