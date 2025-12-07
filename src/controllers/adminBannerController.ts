import { Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../config/database';
import { banners } from '../models/banner';
import { bannerPendingChanges } from '../models/propertyPendingChange';
import { desc, eq, and } from 'drizzle-orm';
import { auditService } from '../services/auditService';

interface AuthRequest extends Request {
  user?: { userId: string; phone: string; role?: string };
}

export const getAdminBanners = async (req: AuthRequest, res: Response) => {
  try {
    const { status = 'approved' } = req.query;
    
    if (status === 'pending') {
      const pending = await db
        .select()
        .from(bannerPendingChanges)
        .where(eq(bannerPendingChanges.status, 'pending'))
        .orderBy(desc(bannerPendingChanges.createdAt));
      
      return res.json({ data: pending });
    }
    
    const results = await db.select().from(banners).orderBy(banners.displayOrder);
    res.json({ data: results });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch banners' });
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

export const createAdminBanner = async (req: AuthRequest, res: Response) => {
  try {
    const data = bannerSchema.parse(req.body);
    const adminId = parseInt(req.user!.userId);
    
    const [banner] = await db.insert(banners).values(data).returning();
    
    await auditService.log(adminId, 'banner_create', 'banner', undefined, { bannerId: banner.id });
    
    res.status(201).json(banner);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    res.status(500).json({ message: 'Failed to create banner' });
  }
};

export const updateAdminBanner = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = bannerSchema.partial().parse(req.body);
    const adminId = parseInt(req.user!.userId);
    
    const [banner] = await db
      .update(banners)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(banners.id, id))
      .returning();
    
    if (!banner) {
      return res.status(404).json({ message: 'Banner not found' });
    }
    
    await auditService.log(adminId, 'banner_update', 'banner', undefined, { bannerId: id });
    
    res.json(banner);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: error.issues[0].message });
    }
    res.status(500).json({ message: 'Failed to update banner' });
  }
};

export const deleteAdminBanner = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = parseInt(req.user!.userId);
    
    await db.delete(banners).where(eq(banners.id, id));
    
    await auditService.log(adminId, 'banner_delete', 'banner', undefined, { bannerId: id });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete banner' });
  }
};

export const reorderBanners = async (req: AuthRequest, res: Response) => {
  try {
    const { orderedIds } = req.body as { orderedIds: string[] };
    const adminId = parseInt(req.user!.userId);
    
    await db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.update(banners).set({ displayOrder: i }).where(eq(banners.id, orderedIds[i]));
      }
    });
    
    await auditService.log(adminId, 'banner_reorder', 'banner', undefined, { orderedIds });
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reorder banners' });
  }
};
