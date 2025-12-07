import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { banners } from '../models/banner';
import { bannerPendingChanges } from '../models/propertyPendingChange';
import { uploads } from '../models/upload';
import { desc, eq, and, or, ilike, sql, inArray } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: { userId: number; role?: string };
}

const querySchema = z.object({
  category: z.enum(['all', 'active', 'inactive', 'pending', 'needs_revision', 'drafts']).optional().default('all'),
  cursor: z.string().optional(),
  limit: z.string().optional().default('20').transform(val => Math.min(parseInt(val) || 20, 50)),
  q: z.string().optional(),
});

export const getEmployeeBanners = async (req: AuthRequest, res: Response) => {
  try {
    const { category, cursor, limit, q } = querySchema.parse(req.query);
    const employeeId = req.user!.userId;
    
    if (category === 'pending' || category === 'drafts' || category === 'needs_revision') {
      let whereConditions = [eq(bannerPendingChanges.proposerId, employeeId)];
      
      if (category === 'pending') {
        whereConditions.push(eq(bannerPendingChanges.status, 'pending'));
      } else if (category === 'drafts') {
        whereConditions.push(eq(bannerPendingChanges.status, 'draft'));
      } else if (category === 'needs_revision') {
        whereConditions.push(eq(bannerPendingChanges.status, 'needs_revision'));
      }
      
      if (q) {
        whereConditions.push(
          sql`${bannerPendingChanges.proposedPayload}->>'title' ILIKE ${`%${q}%`}`
        );
      }
      
      if (cursor) {
        whereConditions.push(sql`${bannerPendingChanges.createdAt} < (SELECT created_at FROM banner_pending_changes WHERE id = ${cursor})`);
      }
      
      const results = await db.select({
        id: bannerPendingChanges.id,
        bannerId: bannerPendingChanges.bannerId,
        proposedPayload: bannerPendingChanges.proposedPayload,
        status: bannerPendingChanges.status,
        createdAt: bannerPendingChanges.createdAt,
      }).from(bannerPendingChanges)
        .where(and(...whereConditions))
        .orderBy(desc(bannerPendingChanges.createdAt))
        .limit(limit + 1);
      
      const hasMore = results.length > limit;
      const data = hasMore ? results.slice(0, limit) : results;
      
      const formattedData = data.map(item => ({
        id: item.id,
        bannerId: item.bannerId,
        imageUrl: (item.proposedPayload as any)?.imageUrl || '',
        title: (item.proposedPayload as any)?.title || 'Banner',
        subtitle: (item.proposedPayload as any)?.subtitle || '',
        targetRole: (item.proposedPayload as any)?.targetRole || 'All',
        isActive: (item.proposedPayload as any)?.isActive || false,
        displayOrder: (item.proposedPayload as any)?.displayOrder || 0,
        status: category,
        createdAt: item.createdAt,
        isPendingChange: true,
      }));
      
      return res.json({ data: formattedData, nextCursor: hasMore ? data[data.length - 1].id : null });
    }
    
    let whereConditions = [];
    
    if (category === 'active') {
      whereConditions.push(eq(banners.isActive, true));
    } else if (category === 'inactive') {
      whereConditions.push(eq(banners.isActive, false));
    }
    
    if (q) {
      whereConditions.push(
        or(
          ilike(banners.title, `%${q}%`),
          ilike(banners.subtitle, `%${q}%`)
        )!
      );
    }
    
    if (cursor) {
      whereConditions.push(sql`${banners.createdAt} < (SELECT created_at FROM banners WHERE id = ${cursor})`);
    }
    
    const results = await db.select().from(banners)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(banners.createdAt))
      .limit(limit + 1);
    
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;
    
    const formattedData = data.map(banner => ({
      ...banner,
      status: banner.isActive ? 'active' : 'inactive',
      isPendingChange: false,
    }));
    
    res.json({ data: formattedData, nextCursor: hasMore ? data[data.length - 1].id : null });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Error fetching employee banners:', error);
    res.status(500).json({ message: 'Failed to fetch banners' });
  }
};

export const getEmployeeBannerById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employeeId = req.user!.userId;
    
    const [banner] = await db.select().from(banners)
      .where(eq(banners.id, id))
      .limit(1);
    
    if (!banner) {
      return res.status(404).json({ message: 'Banner not found' });
    }
    
    const pendingChanges = await db
      .select({
        id: bannerPendingChanges.id,
        status: bannerPendingChanges.status,
        proposedPayload: bannerPendingChanges.proposedPayload,
        createdAt: bannerPendingChanges.createdAt,
        reviewedAt: bannerPendingChanges.reviewedAt,
        reason: bannerPendingChanges.reason,
      })
      .from(bannerPendingChanges)
      .where(and(
        eq(bannerPendingChanges.bannerId, id),
        eq(bannerPendingChanges.proposerId, employeeId),
        eq(bannerPendingChanges.status, 'pending')
      ))
      .orderBy(desc(bannerPendingChanges.createdAt));
    
    res.json({ data: { ...banner, pendingChanges } });
  } catch (error) {
    console.error('Error fetching employee banner:', error);
    res.status(500).json({ message: 'Failed to fetch banner' });
  }
};

const bannerSchema = z.object({
  imageUrl: z.string().url(),
  title: z.string().min(1),
  subtitle: z.string().min(1),
  targetRole: z.enum(['All', 'Agent', 'Customer', 'Employee']).default('All'),
  isActive: z.boolean().default(true),
  displayOrder: z.number().default(0),
});

const pendingChangeSchema = z.object({
  proposed_payload: bannerSchema,
  uploadedAssets: z.array(z.object({
    uploadId: z.string().uuid(),
    key: z.string(),
    publicUrl: z.string()
  })).optional(),
  notes: z.string().optional(),
  idempotencyKey: z.string().uuid().optional(),
  isDraft: z.boolean().optional().default(false),
});

const ALLOWED_EMPLOYEE_FIELDS = ['imageUrl', 'title', 'subtitle', 'targetRole', 'isActive'];

const checkExistingPendingChange = async (bannerId: string, employeeId: number, excludeChangeId?: string) => {
  const conditions = [
    eq(bannerPendingChanges.bannerId, bannerId),
    eq(bannerPendingChanges.proposerId, employeeId),
    eq(bannerPendingChanges.status, 'pending')
  ];
  
  if (excludeChangeId) {
    conditions.push(sql`${bannerPendingChanges.id} != ${excludeChangeId}`);
  }
  
  const existingPendingChange = await db.select().from(bannerPendingChanges)
    .where(and(...conditions))
    .limit(1);
  
  return existingPendingChange.length > 0 ? existingPendingChange[0] : null;
};

export const createEmployeeBanner = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = req.user!.userId;
    const data = pendingChangeSchema.parse(req.body);
    const idempotencyKey = data.idempotencyKey || req.headers['idempotency-key'] as string;
    
    if (data.uploadedAssets && data.uploadedAssets.length > 0) {
      const uploadIds = data.uploadedAssets.map(a => a.uploadId);
      const uploadRecords = await db.select().from(uploads)
        .where(and(
          inArray(uploads.id, uploadIds),
          eq(uploads.ownerId, employeeId)
        ));
      
      if (uploadRecords.length !== uploadIds.length) {
        return res.status(400).json({ message: 'Invalid upload references' });
      }
    }
    
    const [pendingChange] = await db.insert(bannerPendingChanges).values({
      bannerId: null,
      proposerId: employeeId,
      proposedPayload: data.proposed_payload,
      status: data.isDraft ? 'draft' : 'pending',
    }).returning();
    
    if (data.uploadedAssets && data.uploadedAssets.length > 0) {
      await db.update(uploads)
        .set({ status: 'referenced', referencedByChangeId: pendingChange.id })
        .where(inArray(uploads.id, data.uploadedAssets.map(a => a.uploadId)));
    }
    
    res.status(201).json({
      changeId: pendingChange.id,
      status: pendingChange.status,
      created_at: pendingChange.createdAt
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Error creating banner:', error);
    res.status(500).json({ message: 'Failed to create banner' });
  }
};

export const submitBannerPendingChange = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employeeId = req.user!.userId;
    const data = pendingChangeSchema.parse(req.body);
    
    const [banner] = await db.select().from(banners)
      .where(eq(banners.id, id))
      .limit(1);
    
    if (!banner) {
      return res.status(404).json({ message: 'Banner not found' });
    }
    
    if (data.uploadedAssets && data.uploadedAssets.length > 0) {
      const uploadIds = data.uploadedAssets.map(a => a.uploadId);
      const uploadRecords = await db.select().from(uploads)
        .where(and(
          inArray(uploads.id, uploadIds),
          eq(uploads.ownerId, employeeId)
        ));
      
      if (uploadRecords.length !== uploadIds.length) {
        return res.status(400).json({ message: 'Invalid upload references' });
      }
    }
    
    if (!data.isDraft) {
      const existingChange = await checkExistingPendingChange(id, employeeId);
      if (existingChange) {
        const bannerTitle = (existingChange.proposedPayload as any)?.title || banner.title || 'this banner';
        return res.status(409).json({ 
          message: `There is already a pending change for ${bannerTitle} under review. Please withdraw the existing banner change before submitting a new one.`,
          existingChangeId: existingChange.id,
          existingChangeTitle: bannerTitle
        });
      }
    }
    
    const [pendingChange] = await db.insert(bannerPendingChanges).values({
      bannerId: id,
      proposerId: employeeId,
      proposedPayload: data.proposed_payload,
      status: data.isDraft ? 'draft' : 'pending',
    }).returning();
    
    if (data.uploadedAssets && data.uploadedAssets.length > 0) {
      await db.update(uploads)
        .set({ status: 'referenced', referencedByChangeId: pendingChange.id })
        .where(inArray(uploads.id, data.uploadedAssets.map(a => a.uploadId)));
    }
    
    res.status(201).json({
      changeId: pendingChange.id,
      status: pendingChange.status,
      created_at: pendingChange.createdAt
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Error submitting banner change:', error);
    res.status(500).json({ message: 'Failed to submit changes' });
  }
};

export const withdrawBannerPendingChange = async (req: AuthRequest, res: Response) => {
  try {
    const { changeId } = req.params;
    const employeeId = req.user!.userId;
    const moveToDraft = req.query.moveToDraft === 'true';
    
    const [change] = await db.select().from(bannerPendingChanges)
      .where(and(
        eq(bannerPendingChanges.id, changeId),
        eq(bannerPendingChanges.proposerId, employeeId)
      ))
      .limit(1);
    
    if (!change) {
      return res.status(404).json({ message: 'Pending change not found' });
    }
    
    if (moveToDraft) {
      await db.update(bannerPendingChanges)
        .set({ status: 'draft' })
        .where(eq(bannerPendingChanges.id, changeId));
    } else {
      await db.delete(bannerPendingChanges)
        .where(eq(bannerPendingChanges.id, changeId));
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error withdrawing banner change:', error);
    res.status(500).json({ message: 'Failed to withdraw change' });
  }
};

export const updateBannerDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { changeId } = req.params;
    const employeeId = req.user!.userId;
    const data = bannerSchema.parse(req.body);
    
    const [change] = await db.select().from(bannerPendingChanges)
      .where(and(
        eq(bannerPendingChanges.id, changeId),
        eq(bannerPendingChanges.proposerId, employeeId),
        or(
          eq(bannerPendingChanges.status, 'draft'),
          eq(bannerPendingChanges.status, 'needs_revision')
        )!
      ))
      .limit(1);
    
    if (!change) {
      return res.status(404).json({ message: 'Draft or revision not found' });
    }
    
    await db.update(bannerPendingChanges)
      .set({ proposedPayload: data })
      .where(eq(bannerPendingChanges.id, changeId));
    
    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Error updating banner draft:', error);
    res.status(500).json({ message: 'Failed to update draft' });
  }
};

export const submitBannerDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { changeId } = req.params;
    const employeeId = req.user!.userId;
    
    const [change] = await db.select().from(bannerPendingChanges)
      .where(and(
        eq(bannerPendingChanges.id, changeId),
        eq(bannerPendingChanges.proposerId, employeeId),
        or(
          eq(bannerPendingChanges.status, 'draft'),
          eq(bannerPendingChanges.status, 'needs_revision')
        )!
      ))
      .limit(1);
    
    if (!change) {
      return res.status(404).json({ message: 'Draft or revision not found' });
    }
    
    if (change.bannerId) {
      const existingChange = await checkExistingPendingChange(change.bannerId, employeeId, changeId);
      if (existingChange) {
        const bannerTitle = (existingChange.proposedPayload as any)?.title || (change.proposedPayload as any)?.title || 'this banner';
        return res.status(409).json({ 
          message: `There is already a pending change for ${bannerTitle} under review. Please withdraw the existing banner change before submitting a new one.`,
          existingChangeId: existingChange.id,
          existingChangeTitle: bannerTitle
        });
      }
    }
    
    await db.update(bannerPendingChanges)
      .set({ status: 'pending' })
      .where(eq(bannerPendingChanges.id, changeId));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error submitting banner draft:', error);
    res.status(500).json({ message: 'Failed to submit draft' });
  }
};

export const discardBannerDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { changeId } = req.params;
    const employeeId = req.user!.userId;
    
    await db.delete(bannerPendingChanges)
      .where(and(
        eq(bannerPendingChanges.id, changeId),
        eq(bannerPendingChanges.proposerId, employeeId),
        eq(bannerPendingChanges.status, 'draft')
      ));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error discarding banner draft:', error);
    res.status(500).json({ message: 'Failed to discard draft' });
  }
};

export const getEmployeeBannerPendingChanges = async (req: AuthRequest, res: Response) => {
  try {
    const { limit = '20', cursor, status } = req.query;
    const employeeId = req.user!.userId;
    
    let whereConditions = [eq(bannerPendingChanges.proposerId, employeeId)];
    
    if (status && status !== 'all') {
      whereConditions.push(eq(bannerPendingChanges.status, status as string));
    }
    
    if (cursor) {
      whereConditions.push(sql`${bannerPendingChanges.createdAt} < (SELECT created_at FROM banner_pending_changes WHERE id = ${cursor})`);
    }
    
    const results = await db.select({
      id: bannerPendingChanges.id,
      bannerId: bannerPendingChanges.bannerId,
      proposerId: bannerPendingChanges.proposerId,
      proposedPayload: bannerPendingChanges.proposedPayload,
      status: bannerPendingChanges.status,
      reason: bannerPendingChanges.reason,
      createdAt: bannerPendingChanges.createdAt,
      reviewedAt: bannerPendingChanges.reviewedAt,
    }).from(bannerPendingChanges)
      .where(and(...whereConditions))
      .orderBy(desc(bannerPendingChanges.createdAt))
      .limit(parseInt(limit as string) + 1);
    
    const hasMore = results.length > parseInt(limit as string);
    const data = hasMore ? results.slice(0, parseInt(limit as string)) : results;
    
    res.json({ data, nextCursor: hasMore ? data[data.length - 1].id : null });
  } catch (error) {
    console.error('Error fetching banner pending changes:', error);
    res.status(500).json({ message: 'Failed to fetch pending changes' });
  }
};
