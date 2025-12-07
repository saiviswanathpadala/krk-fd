import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { properties } from '../models/property';
import { propertyPendingChanges } from '../models/propertyPendingChange';
import { propertyEmployeeAssignments } from '../models/propertyAssignment';
import { desc, eq, and, or, ilike, sql } from 'drizzle-orm';
import { auditService } from '../services/auditService';

interface AuthRequest extends Request {
  user?: { userId: string; phone: string; role?: string };
}

const querySchema = z.object({
  status: z.enum(['approved', 'pending']).optional().default('approved'),
  cursor: z.string().optional(),
  limit: z.string().optional().default('20').transform(val => Math.min(parseInt(val) || 20, 50)),
  q: z.string().optional(),
});

export const getAdminProperties = async (req: AuthRequest, res: Response) => {
  try {
    const { status, cursor, limit, q } = querySchema.parse(req.query);
    
    if (status === 'pending') {
      const pendingChanges = await db
        .select()
        .from(propertyPendingChanges)
        .where(eq(propertyPendingChanges.status, 'pending'))
        .orderBy(desc(propertyPendingChanges.createdAt))
        .limit(limit + 1);
      
      const hasMore = pendingChanges.length > limit;
      const data = hasMore ? pendingChanges.slice(0, limit) : pendingChanges;
      
      return res.json({ data, nextCursor: hasMore ? data[data.length - 1].id : null });
    }
    
    let whereConditions = [eq(properties.deleted, false)];
    
    if (q) {
      whereConditions.push(
        or(
          ilike(properties.title, `%${q}%`),
          ilike(properties.location, `%${q}%`)
        )!
      );
    }
    
    if (cursor) {
      whereConditions.push(sql`${properties.createdAt} < (SELECT created_at FROM properties WHERE id = ${cursor})`);
    }
    
    const results = await db.select().from(properties)
      .where(and(...whereConditions))
      .orderBy(desc(properties.createdAt))
      .limit(limit + 1);
    
    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;
    
    res.json({ data, nextCursor: hasMore ? data[data.length - 1].id : null });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Error fetching properties:', error);
    res.status(500).json({ message: 'Failed to fetch properties' });
  }
};

export const getAdminPropertyById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    
    const property = await db.select().from(properties).where(eq(properties.id, id)).limit(1);
    
    if (property.length === 0) {
      return res.status(404).json({ message: 'Property not found' });
    }
    
    const pendingChanges = await db
      .select()
      .from(propertyPendingChanges)
      .where(and(eq(propertyPendingChanges.propertyId, id), eq(propertyPendingChanges.status, 'pending')));
    
    res.json({ ...property[0], pendingChanges });
  } catch (error) {
    console.error('Error fetching property by ID:', error);
    res.status(500).json({ message: 'Failed to fetch property' });
  }
};

const propertySchema = z.object({
  title: z.string().min(1),
  location: z.string().min(1),
  price: z.union([z.string(), z.null()]).optional(), // Allow string or null to clear price
  type: z.string().optional(),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  gallery: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  amenities: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  apartmentType: z.array(z.string()).optional(),
  plotSize: z.string().optional(),
  brochureUrl: z.string().optional(),
  latitude: z.string().optional(),
  longitude: z.string().optional(),
  map: z.string().optional(),
  website: z.string().optional(),
  propertyStatus: z.string().optional(),
  assignedEmployeeId: z.number().optional(),
  assignedAgentId: z.number().optional(),
});

export const createAdminProperty = async (req: AuthRequest, res: Response) => {
  try {
    const data = propertySchema.parse(req.body);
    const adminId = parseInt(req.user!.userId);
    
    const insertData: any = { ...data };
    if (data.price) insertData.price = data.price.toString();
    if (data.latitude) insertData.latitude = data.latitude.toString();
    if (data.longitude) insertData.longitude = data.longitude.toString();
    
    const [property] = await db.insert(properties).values(insertData).returning();
    
    await auditService.log(adminId, 'property_create', 'property', undefined, { propertyId: property.id });
    
    res.status(201).json(property);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    res.status(500).json({ message: 'Failed to create property' });
  }
};

export const updateAdminProperty = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = propertySchema.partial().parse(req.body);
    const adminId = parseInt(req.user!.userId);
    
    const updateData: any = { ...data, updatedAt: new Date() };
    // Handle price: set to null if explicitly null/empty, otherwise convert to string
    if (data.price !== undefined) {
      updateData.price = data.price === null || data.price === '' ? null : data.price.toString();
    }
    if (data.latitude) updateData.latitude = data.latitude.toString();
    if (data.longitude) updateData.longitude = data.longitude.toString();
    
    const [property] = await db
      .update(properties)
      .set(updateData)
      .where(eq(properties.id, id))
      .returning();
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found' });
    }
    
    await auditService.log(adminId, 'property_update', 'property', undefined, { propertyId: id });
    
    res.json(property);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    res.status(500).json({ message: 'Failed to update property' });
  }
};

export const deleteAdminProperty = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = parseInt(req.user!.userId);
    
    await db.delete(propertyEmployeeAssignments)
      .where(eq(propertyEmployeeAssignments.propertyId, id));
    
    await db
      .update(properties)
      .set({ deleted: true, deletedAt: new Date(), deletedByAdminId: adminId })
      .where(eq(properties.id, id));
    
    await auditService.log(adminId, 'property_delete', 'property', undefined, { propertyId: id });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting property:', error);
    res.status(500).json({ message: 'Failed to delete property' });
  }
};

export const approvePendingChange = async (req: AuthRequest, res: Response) => {
  try {
    const { id, changeId } = req.params;
    const adminId = parseInt(req.user!.userId);
    
    const [change] = await db
      .select()
      .from(propertyPendingChanges)
      .where(eq(propertyPendingChanges.id, changeId))
      .limit(1);
    
    if (!change) {
      return res.status(404).json({ message: 'Pending change not found' });
    }
    
    const result = await db.transaction(async (tx) => {
      let property;
      
      if (change.propertyId) {
        await tx
          .update(properties)
          .set({ ...change.proposedPayload, updatedAt: new Date() })
          .where(eq(properties.id, id));
        
        [property] = await tx.select().from(properties).where(eq(properties.id, id));
      } else {
        [property] = await tx.insert(properties).values({
          ...change.proposedPayload,
          assignedEmployeeId: change.proposerId,
          createdByEmployeeId: change.proposerId,
        }).returning();
      }
      
      await tx
        .update(propertyPendingChanges)
        .set({ status: 'approved', reviewedAt: new Date(), reviewedByAdminId: adminId })
        .where(eq(propertyPendingChanges.id, changeId));
      
      return property;
    });
    
    await auditService.log(adminId, 'property_change_approve', 'property', undefined, { propertyId: result.id, changeId });
    
    res.json(result);
  } catch (error) {
    console.error('Error approving pending change:', error);
    res.status(500).json({ message: 'Failed to approve change' });
  }
};

export const rejectPendingChange = async (req: AuthRequest, res: Response) => {
  try {
    const { changeId } = req.params;
    const { reason } = req.body;
    const adminId = parseInt(req.user!.userId);
    
    await db
      .update(propertyPendingChanges)
      .set({ status: 'rejected', reason, reviewedAt: new Date(), reviewedByAdminId: adminId })
      .where(eq(propertyPendingChanges.id, changeId));
    
    await auditService.log(adminId, 'property_change_reject', 'property_pending_change', undefined, { changeId, reason });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error rejecting pending change:', error);
    res.status(500).json({ message: 'Failed to reject change' });
  }
};

export const createAdminPropertyDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = propertySchema.parse(req.body);
    const adminId = parseInt(req.user!.userId);
    
    const [draft] = await db.insert(propertyPendingChanges).values({
      propertyId: id || null,
      proposerId: adminId,
      proposedPayload: data,
      status: 'draft',
      isDraft: true,
    }).returning();
    
    await auditService.log(adminId, 'property_draft_create', 'property_pending_change', undefined, { draftId: draft.id, propertyId: id });
    
    res.status(201).json(draft);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    res.status(500).json({ message: 'Failed to create draft' });
  }
};

export const updateAdminDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { draftId } = req.params;
    const data = propertySchema.parse(req.body);
    const adminId = parseInt(req.user!.userId);
    
    const [draft] = await db
      .update(propertyPendingChanges)
      .set({ proposedPayload: data })
      .where(and(eq(propertyPendingChanges.id, draftId), eq(propertyPendingChanges.proposerId, adminId), eq(propertyPendingChanges.isDraft, true)))
      .returning();
    
    if (!draft) {
      return res.status(404).json({ message: 'Draft not found' });
    }
    
    await auditService.log(adminId, 'property_draft_update', 'property_pending_change', undefined, { draftId });
    
    res.json(draft);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    res.status(500).json({ message: 'Failed to update draft' });
  }
};

export const submitAdminDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { draftId } = req.params;
    const adminId = parseInt(req.user!.userId);
    
    const [draft] = await db
      .select()
      .from(propertyPendingChanges)
      .where(and(eq(propertyPendingChanges.id, draftId), eq(propertyPendingChanges.proposerId, adminId), eq(propertyPendingChanges.isDraft, true)))
      .limit(1);
    
    if (!draft) {
      return res.status(404).json({ message: 'Draft not found' });
    }
    
    let property;
    if (draft.propertyId) {
      [property] = await db
        .update(properties)
        .set({ ...draft.proposedPayload, updatedAt: new Date() })
        .where(eq(properties.id, draft.propertyId))
        .returning();
    } else {
      [property] = await db.insert(properties).values(draft.proposedPayload).returning();
    }
    
    await db.delete(propertyPendingChanges).where(eq(propertyPendingChanges.id, draftId));
    
    await auditService.log(adminId, 'property_draft_submit', 'property', undefined, { draftId, propertyId: property.id });
    
    res.json(property);
  } catch (error) {
    console.error('Error submitting draft:', error);
    res.status(500).json({ message: 'Failed to submit draft' });
  }
};

export const discardAdminDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { draftId } = req.params;
    const adminId = parseInt(req.user!.userId);
    
    const result = await db
      .delete(propertyPendingChanges)
      .where(and(eq(propertyPendingChanges.id, draftId), eq(propertyPendingChanges.proposerId, adminId), eq(propertyPendingChanges.isDraft, true)))
      .returning();
    
    if (result.length === 0) {
      return res.status(404).json({ message: 'Draft not found' });
    }
    
    await auditService.log(adminId, 'property_draft_discard', 'property_pending_change', undefined, { draftId });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error discarding draft:', error);
    res.status(500).json({ message: 'Failed to discard draft' });
  }
};
