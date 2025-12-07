import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { properties } from '../models/property';
import { banners } from '../models/banner';
import { propertyPendingChanges, bannerPendingChanges } from '../models/propertyPendingChange';
import { users } from '../models/user';
import { desc, eq, and, or, sql, ilike } from 'drizzle-orm';
import { auditService } from '../services/auditService';

interface AuthRequest extends Request {
  user?: { userId: string; phone: string; role?: string };
}

const querySchema = z.object({
  type: z.enum(['property', 'banner', 'all']).optional().default('all'),
  status: z.enum(['pending', 'needs_revision', 'approved', 'rejected', 'draft']).optional().default('pending'),
  cursor: z.string().optional(),
  limit: z.string().optional().default('20').transform(val => Math.min(parseInt(val) || 20, 50)),
  q: z.string().optional(),
  proposerId: z.string().optional(),
});

export const getPendingChanges = async (req: AuthRequest, res: Response) => {
  try {
    const { type, status, cursor, limit, q, proposerId } = querySchema.parse(req.query);
    
    const results: any[] = [];
    
    if (type === 'property' || type === 'all') {
      let conditions = [eq(propertyPendingChanges.status, status)];
      if (proposerId) conditions.push(eq(propertyPendingChanges.proposerId, parseInt(proposerId)));
      if (cursor) conditions.push(sql`${propertyPendingChanges.createdAt} < (SELECT created_at FROM property_pending_changes WHERE id = ${cursor})`);
      
      const propChanges = await db
        .select({
          id: propertyPendingChanges.id,
          type: sql<string>`'property'`,
          targetId: propertyPendingChanges.propertyId,
          proposerId: propertyPendingChanges.proposerId,
          proposedPayload: propertyPendingChanges.proposedPayload,
          diffSummary: propertyPendingChanges.diffSummary,
          status: propertyPendingChanges.status,
          reason: propertyPendingChanges.reason,
          createdAt: propertyPendingChanges.createdAt,
          reviewedAt: propertyPendingChanges.reviewedAt,
          reviewedByAdminId: propertyPendingChanges.reviewedByAdminId,
          proposerName: users.name,
          proposerEmail: users.email,
          proposerAvatar: users.profileImgUrl,
          targetTitle: properties.title,
          targetThumbnail: sql<string>`(${properties.images}->0)::text`,
        })
        .from(propertyPendingChanges)
        .leftJoin(users, eq(propertyPendingChanges.proposerId, users.id))
        .leftJoin(properties, eq(propertyPendingChanges.propertyId, properties.id))
        .where(and(...conditions))
        .orderBy(desc(propertyPendingChanges.createdAt))
        .limit(limit + 1);
      
      results.push(...propChanges);
    }
    
    if (type === 'banner' || type === 'all') {
      let conditions = [eq(bannerPendingChanges.status, status)];
      if (proposerId) conditions.push(eq(bannerPendingChanges.proposerId, parseInt(proposerId)));
      if (cursor) conditions.push(sql`${bannerPendingChanges.createdAt} < (SELECT created_at FROM banner_pending_changes WHERE id = ${cursor})`);
      
      const bannerChanges = await db
        .select({
          id: bannerPendingChanges.id,
          type: sql<string>`'banner'`,
          targetId: bannerPendingChanges.bannerId,
          proposerId: bannerPendingChanges.proposerId,
          proposedPayload: bannerPendingChanges.proposedPayload,
          diffSummary: bannerPendingChanges.diffSummary,
          status: bannerPendingChanges.status,
          reason: bannerPendingChanges.reason,
          createdAt: bannerPendingChanges.createdAt,
          reviewedAt: bannerPendingChanges.reviewedAt,
          reviewedByAdminId: bannerPendingChanges.reviewedByAdminId,
          proposerName: users.name,
          proposerEmail: users.email,
          proposerAvatar: users.profileImgUrl,
          targetTitle: banners.title,
          targetThumbnail: banners.imageUrl,
        })
        .from(bannerPendingChanges)
        .leftJoin(users, eq(bannerPendingChanges.proposerId, users.id))
        .leftJoin(banners, eq(bannerPendingChanges.bannerId, banners.id))
        .where(and(...conditions))
        .orderBy(desc(bannerPendingChanges.createdAt))
        .limit(limit + 1);
      
      results.push(...bannerChanges);
    }
    
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;
    
    res.json({ data, nextCursor: hasMore ? data[data.length - 1].id : null });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Error fetching pending changes:', error);
    res.status(500).json({ message: 'Failed to fetch pending changes' });
  }
};

export const getPendingChangeById = async (req: AuthRequest, res: Response) => {
  try {
    const { changeId } = req.params;
    
    const [propChange] = await db
      .select({
        id: propertyPendingChanges.id,
        type: sql<string>`'property'`,
        targetId: propertyPendingChanges.propertyId,
        proposerId: propertyPendingChanges.proposerId,
        proposedPayload: propertyPendingChanges.proposedPayload,
        diffSummary: propertyPendingChanges.diffSummary,
        status: propertyPendingChanges.status,
        reason: propertyPendingChanges.reason,
        createdAt: propertyPendingChanges.createdAt,
        reviewedAt: propertyPendingChanges.reviewedAt,
        reviewedByAdminId: propertyPendingChanges.reviewedByAdminId,
        proposerName: users.name,
        proposerEmail: users.email,
        proposerAvatar: users.profileImgUrl,
        originalPayload: properties,
      })
      .from(propertyPendingChanges)
      .leftJoin(users, eq(propertyPendingChanges.proposerId, users.id))
      .leftJoin(properties, eq(propertyPendingChanges.propertyId, properties.id))
      .where(eq(propertyPendingChanges.id, changeId))
      .limit(1);
    
    if (propChange) {
      return res.json(propChange);
    }
    
    const [bannerChange] = await db
      .select({
        id: bannerPendingChanges.id,
        type: sql<string>`'banner'`,
        targetId: bannerPendingChanges.bannerId,
        proposerId: bannerPendingChanges.proposerId,
        proposedPayload: bannerPendingChanges.proposedPayload,
        diffSummary: bannerPendingChanges.diffSummary,
        status: bannerPendingChanges.status,
        reason: bannerPendingChanges.reason,
        createdAt: bannerPendingChanges.createdAt,
        reviewedAt: bannerPendingChanges.reviewedAt,
        reviewedByAdminId: bannerPendingChanges.reviewedByAdminId,
        proposerName: users.name,
        proposerEmail: users.email,
        proposerAvatar: users.profileImgUrl,
        originalPayload: banners,
      })
      .from(bannerPendingChanges)
      .leftJoin(users, eq(bannerPendingChanges.proposerId, users.id))
      .leftJoin(banners, eq(bannerPendingChanges.bannerId, banners.id))
      .where(eq(bannerPendingChanges.id, changeId))
      .limit(1);
    
    if (bannerChange) {
      return res.json(bannerChange);
    }
    
    res.status(404).json({ message: 'Pending change not found' });
  } catch (error) {
    console.error('Error fetching pending change:', error);
    res.status(500).json({ message: 'Failed to fetch pending change' });
  }
};

const approveSchema = z.object({
  applyAs: z.enum(['proposed', 'mergedPayload']).optional().default('proposed'),
  mergedPayload: z.any().optional(),
});

export const approvePendingChange = async (req: AuthRequest, res: Response) => {
  try {
    const { changeId } = req.params;
    const { applyAs, mergedPayload } = approveSchema.parse(req.body);
    const adminId = parseInt(req.user!.userId);
    
    const [propChange] = await db
      .select()
      .from(propertyPendingChanges)
      .where(eq(propertyPendingChanges.id, changeId))
      .limit(1);
    
    if (propChange) {
      if (propChange.status !== 'pending' && propChange.status !== 'needs_revision') {
        return res.status(400).json({ message: 'Change already processed' });
      }
      
      const payload = applyAs === 'mergedPayload' && mergedPayload ? mergedPayload : propChange.proposedPayload;
      
      let property;
      let oldProperty = null;
      
      try {
        if (propChange.propertyId) {
          [oldProperty] = await db.select().from(properties).where(eq(properties.id, propChange.propertyId)).limit(1);
          
          const updateData: any = { ...payload, updatedAt: new Date() };
          if (payload.price !== undefined) {
            updateData.price = payload.price === null || payload.price === '' ? null : payload.price.toString();
          }
          
          [property] = await db
            .update(properties)
            .set(updateData)
            .where(eq(properties.id, propChange.propertyId))
            .returning();
        } else {
          [property] = await db.insert(properties).values({
            ...payload,
            assignedEmployeeId: propChange.proposerId,
            createdByEmployeeId: propChange.proposerId,
          }).returning();
        }
        
        await db
          .update(propertyPendingChanges)
          .set({ status: 'approved', reviewedAt: new Date(), reviewedByAdminId: adminId })
          .where(eq(propertyPendingChanges.id, changeId));
        
        const result = property;
        
        await auditService.log(adminId, 'property_change_approve', 'property', undefined, { 
          propertyId: result.id, 
          changeId,
          before: oldProperty,
          after: result 
        });
        
        return res.json(result);
      } catch (error) {
        if (property && propChange.propertyId && oldProperty) {
          try {
            await db.update(properties).set(oldProperty).where(eq(properties.id, propChange.propertyId));
          } catch (rollbackError) {
            console.error('Failed to rollback property update:', rollbackError);
          }
        }
        throw error;
      }
    }
    
    const [bannerChange] = await db
      .select()
      .from(bannerPendingChanges)
      .where(eq(bannerPendingChanges.id, changeId))
      .limit(1);
    
    if (bannerChange) {
      if (bannerChange.status !== 'pending' && bannerChange.status !== 'needs_revision') {
        return res.status(400).json({ message: 'Change already processed' });
      }
      
      const payload = applyAs === 'mergedPayload' && mergedPayload ? mergedPayload : bannerChange.proposedPayload;
      
      let banner;
      let oldBanner = null;
      
      try {
        if (bannerChange.bannerId) {
          [oldBanner] = await db.select().from(banners).where(eq(banners.id, bannerChange.bannerId)).limit(1);
          
          [banner] = await db
            .update(banners)
            .set({ ...payload, updatedAt: new Date() })
            .where(eq(banners.id, bannerChange.bannerId))
            .returning();
        } else {
          [banner] = await db.insert(banners).values(payload).returning();
        }
        
        await db
          .update(bannerPendingChanges)
          .set({ status: 'approved', reviewedAt: new Date(), reviewedByAdminId: adminId })
          .where(eq(bannerPendingChanges.id, changeId));
        
        const result = banner;
        
        await auditService.log(adminId, 'banner_change_approve', 'banner', undefined, { 
          bannerId: result.id, 
          changeId,
          before: oldBanner,
          after: result 
        });
        
        return res.json(result);
      } catch (error) {
        if (banner && bannerChange.bannerId && oldBanner) {
          try {
            await db.update(banners).set(oldBanner).where(eq(banners.id, bannerChange.bannerId));
          } catch (rollbackError) {
            console.error('Failed to rollback banner update:', rollbackError);
          }
        }
        throw error;
      }
    }
    
    res.status(404).json({ message: 'Pending change not found' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Error approving change:', error);
    res.status(500).json({ message: 'Failed to approve change' });
  }
};

const rejectSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});

export const rejectPendingChange = async (req: AuthRequest, res: Response) => {
  try {
    const { changeId } = req.params;
    const { reason } = rejectSchema.parse(req.body);
    const adminId = parseInt(req.user!.userId);
    
    const [propChange] = await db
      .select()
      .from(propertyPendingChanges)
      .where(eq(propertyPendingChanges.id, changeId))
      .limit(1);
    
    if (propChange) {
      await db
        .update(propertyPendingChanges)
        .set({ status: 'rejected', reason, reviewedAt: new Date(), reviewedByAdminId: adminId })
        .where(eq(propertyPendingChanges.id, changeId));
      
      await auditService.log(adminId, 'property_change_reject', 'property_pending_change', undefined, { changeId, reason });
      
      return res.json({ success: true });
    }
    
    const [bannerChange] = await db
      .select()
      .from(bannerPendingChanges)
      .where(eq(bannerPendingChanges.id, changeId))
      .limit(1);
    
    if (bannerChange) {
      await db
        .update(bannerPendingChanges)
        .set({ status: 'rejected', reason, reviewedAt: new Date(), reviewedByAdminId: adminId })
        .where(eq(bannerPendingChanges.id, changeId));
      
      await auditService.log(adminId, 'banner_change_reject', 'banner_pending_change', undefined, { changeId, reason });
      
      return res.json({ success: true });
    }
    
    res.status(404).json({ message: 'Pending change not found' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Error rejecting change:', error);
    res.status(500).json({ message: 'Failed to reject change' });
  }
};

const requestChangesSchema = z.object({
  comments: z.string().min(1, 'Comments are required'),
});

export const requestChanges = async (req: AuthRequest, res: Response) => {
  try {
    const { changeId } = req.params;
    const { comments } = requestChangesSchema.parse(req.body);
    const adminId = parseInt(req.user!.userId);
    
    const [propChange] = await db
      .select()
      .from(propertyPendingChanges)
      .where(eq(propertyPendingChanges.id, changeId))
      .limit(1);
    
    if (propChange) {
      await db
        .update(propertyPendingChanges)
        .set({ 
          status: 'needs_revision', 
          reason: comments, 
          reviewedAt: new Date(), 
          reviewedByAdminId: adminId 
        })
        .where(eq(propertyPendingChanges.id, changeId));
      
      await auditService.log(adminId, 'property_change_request_revision', 'property_pending_change', undefined, { changeId, comments });
      
      return res.json({ success: true });
    }
    
    const [bannerChange] = await db
      .select()
      .from(bannerPendingChanges)
      .where(eq(bannerPendingChanges.id, changeId))
      .limit(1);
    
    if (bannerChange) {
      await db
        .update(bannerPendingChanges)
        .set({ 
          status: 'needs_revision', 
          reason: comments, 
          reviewedAt: new Date(), 
          reviewedByAdminId: adminId 
        })
        .where(eq(bannerPendingChanges.id, changeId));
      
      await auditService.log(adminId, 'banner_change_request_revision', 'banner_pending_change', undefined, { changeId, comments });
      
      return res.json({ success: true });
    }
    
    res.status(404).json({ message: 'Pending change not found' });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Error requesting changes:', error);
    res.status(500).json({ message: 'Failed to request changes' });
  }
};
