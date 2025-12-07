import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { properties } from '../models/property';
import { propertyPendingChanges } from '../models/propertyPendingChange';
import { uploads, propertyPendingChangesIdempotency } from '../models/upload';
import { propertyEmployeeAssignments } from '../models/propertyAssignment';
import { desc, eq, and, or, ilike, sql, inArray } from 'drizzle-orm';

interface AuthRequest extends Request {
  user?: { userId: number; role?: string };
}

const querySchema = z.object({
  status: z.enum(['all', 'approved', 'pending', 'needs_revision']).optional().default('all'),
  cursor: z.string().optional(),
  limit: z.string().optional().default('20').transform(val => Math.min(parseInt(val) || 20, 50)),
  q: z.string().optional(),
});

export const getEmployeeProperties = async (req: AuthRequest, res: Response) => {
  try {
    const { status, cursor, limit, q } = querySchema.parse(req.query);
    const employeeId = req.user!.userId;
    
    const assignments = await db.select({ propertyId: propertyEmployeeAssignments.propertyId })
      .from(propertyEmployeeAssignments)
      .where(eq(propertyEmployeeAssignments.employeeId, employeeId));
    
    const assignedPropertyIds = assignments.map(a => a.propertyId);
    
    if (assignedPropertyIds.length === 0) {
      return res.json({ data: [], nextCursor: null });
    }
    
    let whereConditions = [
      inArray(properties.id, assignedPropertyIds),
      eq(properties.deleted, false)
    ];
    
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
    
    const results = await db.select({
      id: properties.id,
      title: properties.title,
      location: properties.location,
      type: properties.type,
      images: properties.images,
      createdAt: properties.createdAt,
      updatedAt: properties.updatedAt,
      assignedEmployeeId: properties.assignedEmployeeId,
      assignedAgentId: properties.assignedAgentId
    }).from(properties)
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
    console.error('Error fetching employee properties:', error);
    res.status(500).json({ message: 'Failed to fetch properties' });
  }
};

export const getEmployeePropertyById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employeeId = req.user!.userId;
    
    const [assignment] = await db.select()
      .from(propertyEmployeeAssignments)
      .where(and(
        eq(propertyEmployeeAssignments.propertyId, id),
        eq(propertyEmployeeAssignments.employeeId, employeeId)
      ))
      .limit(1);
    
    if (!assignment) {
      return res.status(404).json({ message: 'Property not found or not assigned to you' });
    }
    
    const [property] = await db.select().from(properties)
      .where(and(
        eq(properties.id, id),
        eq(properties.deleted, false)
      ))
      .limit(1);
    
    if (!property) {
      return res.status(404).json({ message: 'Property not found or not assigned to you' });
    }
    
    const pendingChanges = await db
      .select({
        id: propertyPendingChanges.id,
        status: propertyPendingChanges.status,
        proposedPayload: propertyPendingChanges.proposedPayload,
        createdAt: propertyPendingChanges.createdAt,
        reviewedAt: propertyPendingChanges.reviewedAt
      })
      .from(propertyPendingChanges)
      .where(and(
        eq(propertyPendingChanges.propertyId, id),
        eq(propertyPendingChanges.proposerId, employeeId),
        eq(propertyPendingChanges.status, 'pending')
      ))
      .orderBy(desc(propertyPendingChanges.createdAt));
    
    res.json({ data: { ...property, pendingChanges } });
  } catch (error) {
    console.error('Error fetching employee property:', error);
    res.status(500).json({ message: 'Failed to fetch property' });
  }
};

const pendingChangeSchema = z.object({
  proposed_payload: z.record(z.string(), z.any()),
  diff_summary: z.record(z.string(), z.any()).optional(),
  uploadedAssets: z.array(z.object({
    uploadId: z.string().uuid(),
    key: z.string(),
    publicUrl: z.string()
  })).optional(),
  notes: z.string().optional(),
  idempotencyKey: z.string().uuid().optional(),
  isDraft: z.boolean().optional().default(false), // Allow creating drafts directly
});

const ALLOWED_EMPLOYEE_FIELDS = [
  'title', 'location', 'price', 'type', 'description', 'images', 'gallery',
  'features', 'amenities', 'categories', 'brochureUrl', 'map', 'website'
];

export const submitPendingChange = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const employeeId = req.user!.userId;
    const data = pendingChangeSchema.parse(req.body);
    const idempotencyKey = data.idempotencyKey || req.headers['idempotency-key'] as string;
    
    if (idempotencyKey) {
      const [existing] = await db.select().from(propertyPendingChangesIdempotency)
        .where(eq(propertyPendingChangesIdempotency.idempotencyKey, idempotencyKey))
        .limit(1);
      
      if (existing) {
        const [change] = await db.select().from(propertyPendingChanges)
          .where(eq(propertyPendingChanges.id, existing.changeId))
          .limit(1);
        return res.status(200).json({
          changeId: change.id,
          status: change.status,
          created_at: change.createdAt,
          idempotent: true
        });
      }
    }
    
    const [assignment] = await db.select()
      .from(propertyEmployeeAssignments)
      .where(and(
        eq(propertyEmployeeAssignments.propertyId, id),
        eq(propertyEmployeeAssignments.employeeId, employeeId)
      ))
      .limit(1);
    
    if (!assignment) {
      return res.status(403).json({ message: 'Property not found or not assigned to you' });
    }
    
    const [property] = await db.select().from(properties)
      .where(and(
        eq(properties.id, id),
        eq(properties.deleted, false)
      ))
      .limit(1);
    
    if (!property) {
      return res.status(403).json({ message: 'Property not found or not assigned to you' });
    }
    
    const proposedFields = Object.keys(data.proposed_payload);
    const invalidFields = proposedFields.filter(field => !ALLOWED_EMPLOYEE_FIELDS.includes(field));
    
    if (invalidFields.length > 0) {
      return res.status(400).json({ 
        message: `Cannot modify fields: ${invalidFields.join(', ')}` 
      });
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
    
    // If not creating a draft, check if there's already a pending change for this property
    if (!data.isDraft) {
      const existingPendingChange = await db.select().from(propertyPendingChanges)
        .where(and(
          eq(propertyPendingChanges.propertyId, id),
          eq(propertyPendingChanges.proposerId, employeeId),
          eq(propertyPendingChanges.status, 'pending'),
          eq(propertyPendingChanges.isDraft, false)
        ))
        .limit(1);
      
      if (existingPendingChange.length > 0) {
        const existingChange = existingPendingChange[0];
        const propertyTitle = (existingChange.proposedPayload as any)?.title || 'this property';
        return res.status(409).json({ 
          message: `There is already a pending change for ${propertyTitle} under review. Please withdraw the existing pending change before submitting a new one.`,
          existingChangeId: existingChange.id,
          existingChangeTitle: propertyTitle
        });
      }
    }
    
    const [pendingChange] = await db.insert(propertyPendingChanges).values({
      propertyId: id,
      proposerId: employeeId,
      proposedPayload: data.proposed_payload,
      diffSummary: data.diff_summary,
      status: data.isDraft ? 'draft' : 'pending',
      isDraft: data.isDraft || false
    }).returning();
    
    if (data.uploadedAssets && data.uploadedAssets.length > 0) {
      await db.update(uploads)
        .set({ status: 'referenced', referencedByChangeId: pendingChange.id })
        .where(inArray(uploads.id, data.uploadedAssets.map(a => a.uploadId)));
    }
    
    if (idempotencyKey) {
      await db.insert(propertyPendingChangesIdempotency).values({
        idempotencyKey,
        changeId: pendingChange.id,
        status: 'completed'
      });
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
    console.error('Error submitting pending change:', error);
    res.status(500).json({ message: 'Failed to submit changes' });
  }
};

const createPropertySchema = z.object({
  title: z.string().min(1),
  location: z.string().min(1),
  price: z.string().optional().nullable(),
  type: z.string().default('New Listing'),
  description: z.string().optional(),
  images: z.array(z.string()).default([]),
  gallery: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  amenities: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
  brochureUrl: z.string().optional(),
  map: z.string().optional(),
  website: z.string().optional(),
  isDraft: z.boolean().optional().default(false),
});

export const createProperty = async (req: AuthRequest, res: Response) => {
  try {
    const employeeId = req.user!.userId;
    const { isDraft, ...propertyData } = createPropertySchema.parse(req.body);
    
    const [pendingChange] = await db.insert(propertyPendingChanges).values({
      propertyId: null,
      proposerId: employeeId,
      proposedPayload: propertyData,
      status: isDraft ? 'draft' : 'pending',
      isDraft: isDraft
    }).returning();
    
    res.status(201).json({ 
      changeId: pendingChange.id,
      status: pendingChange.status,
      created_at: pendingChange.createdAt
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Error creating property:', error);
    res.status(500).json({ message: 'Failed to create property' });
  }
};

export const withdrawPendingChange = async (req: AuthRequest, res: Response) => {
  try {
    const { changeId } = req.params;
    const employeeId = req.user!.userId;
    // Check if moveToDraft query parameter is provided
    const moveToDraft = req.query.moveToDraft === 'true';
    
    const [change] = await db.select().from(propertyPendingChanges)
      .where(and(
        eq(propertyPendingChanges.id, changeId),
        eq(propertyPendingChanges.proposerId, employeeId)
      ))
      .limit(1);
    
    if (!change) {
      return res.status(404).json({ message: 'Pending change not found' });
    }
    
    if (moveToDraft) {
      // Move to draft instead of deleting
      await db.update(propertyPendingChanges)
        .set({ isDraft: true, status: 'draft' })
        .where(eq(propertyPendingChanges.id, changeId));
    } else {
      // Discard: delete the pending change
      if (change.propertyId) {
        await db.delete(propertyPendingChanges)
          .where(eq(propertyPendingChanges.id, changeId));
      } else {
        // For new properties, delete as well (or could move to draft, but keeping original behavior)
        await db.delete(propertyPendingChanges)
          .where(eq(propertyPendingChanges.id, changeId));
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error withdrawing change:', error);
    res.status(500).json({ message: 'Failed to withdraw change' });
  }
};

export const updateDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { changeId } = req.params;
    const employeeId = req.user!.userId;
    const data = createPropertySchema.parse(req.body);
    
    const [change] = await db.select().from(propertyPendingChanges)
      .where(and(
        eq(propertyPendingChanges.id, changeId),
        eq(propertyPendingChanges.proposerId, employeeId),
        or(
          eq(propertyPendingChanges.isDraft, true),
          eq(propertyPendingChanges.status, 'needs_revision')
        )!
      ))
      .limit(1);
    
    if (!change) {
      return res.status(404).json({ message: 'Draft or revision not found' });
    }
    
    await db.update(propertyPendingChanges)
      .set({ proposedPayload: data })
      .where(eq(propertyPendingChanges.id, changeId));
    
    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    console.error('Error updating draft:', error);
    res.status(500).json({ message: 'Failed to update draft' });
  }
};

export const submitDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { changeId } = req.params;
    const employeeId = req.user!.userId;
    
    const [change] = await db.select().from(propertyPendingChanges)
      .where(and(
        eq(propertyPendingChanges.id, changeId),
        eq(propertyPendingChanges.proposerId, employeeId),
        or(
          eq(propertyPendingChanges.isDraft, true),
          eq(propertyPendingChanges.status, 'needs_revision')
        )!
      ))
      .limit(1);
    
    if (!change) {
      return res.status(404).json({ message: 'Draft or revision not found' });
    }
    
    // Check if there's already a pending change (not draft) for this property
    if (change.propertyId) {
      const existingPendingChange = await db.select().from(propertyPendingChanges)
        .where(and(
          eq(propertyPendingChanges.propertyId, change.propertyId),
          eq(propertyPendingChanges.proposerId, employeeId),
          eq(propertyPendingChanges.status, 'pending'),
          eq(propertyPendingChanges.isDraft, false),
          sql`${propertyPendingChanges.id} != ${changeId}`
        ))
        .limit(1);
      
      if (existingPendingChange.length > 0) {
        const existingChange = existingPendingChange[0];
        const propertyTitle = (existingChange.proposedPayload as any)?.title || 'this property';
        return res.status(409).json({ 
          message: `There is already a pending change for ${propertyTitle} under review. Please withdraw the existing pending change before submitting a new one.`,
          existingChangeId: existingChange.id,
          existingChangeTitle: propertyTitle
        });
      }
    }
    
    await db.update(propertyPendingChanges)
      .set({ isDraft: false, status: 'pending' })
      .where(eq(propertyPendingChanges.id, changeId));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error submitting draft:', error);
    res.status(500).json({ message: 'Failed to submit draft' });
  }
};

export const discardDraft = async (req: AuthRequest, res: Response) => {
  try {
    const { changeId } = req.params;
    const employeeId = req.user!.userId;
    
    await db.delete(propertyPendingChanges)
      .where(and(
        eq(propertyPendingChanges.id, changeId),
        eq(propertyPendingChanges.proposerId, employeeId),
        eq(propertyPendingChanges.isDraft, true)
      ));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error discarding draft:', error);
    res.status(500).json({ message: 'Failed to discard draft' });
  }
};

export const getEmployeePendingChanges = async (req: AuthRequest, res: Response) => {
  try {
    const { limit = '20', cursor, status } = req.query;
    const employeeId = req.user!.userId;
    
    let whereConditions = [eq(propertyPendingChanges.proposerId, employeeId)];
    
    if (status && status !== 'all') {
      whereConditions.push(eq(propertyPendingChanges.status, status as string));
    }
    
    if (cursor) {
      whereConditions.push(sql`${propertyPendingChanges.createdAt} < (SELECT created_at FROM property_pending_changes WHERE id = ${cursor})`);
    }
    
    const results = await db.select({
      id: propertyPendingChanges.id,
      propertyId: propertyPendingChanges.propertyId,
      proposerId: propertyPendingChanges.proposerId,
      proposedPayload: propertyPendingChanges.proposedPayload,
      status: propertyPendingChanges.status,
      reason: propertyPendingChanges.reason,
      isDraft: propertyPendingChanges.isDraft,
      createdAt: propertyPendingChanges.createdAt,
      reviewedAt: propertyPendingChanges.reviewedAt,
    }).from(propertyPendingChanges)
      .where(and(...whereConditions))
      .orderBy(desc(propertyPendingChanges.createdAt))
      .limit(parseInt(limit as string) + 1);
    
    const hasMore = results.length > parseInt(limit as string);
    const data = hasMore ? results.slice(0, parseInt(limit as string)) : results;
    
    res.json({ data, nextCursor: hasMore ? data[data.length - 1].id : null });
  } catch (error) {
    console.error('Error fetching pending changes:', error);
    res.status(500).json({ message: 'Failed to fetch pending changes' });
  }
};