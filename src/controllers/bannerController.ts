import { Request, Response } from 'express';
import { db } from '../config/database';
import { banners } from '../models/banner';
import { eq, or, and, asc } from 'drizzle-orm';

export const getBanners = async (req: Request, res: Response) => {
  try {
    const { role } = req.query;

    const conditions = [eq(banners.isActive, true)];
    
    if (role && role !== 'All') {
      conditions.push(
        or(
          eq(banners.targetRole, role as string),
          eq(banners.targetRole, 'All')
        )!
      );
    }

    const result = await db
      .select()
      .from(banners)
      .where(and(...conditions))
      .orderBy(asc(banners.displayOrder));

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Get banners error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch banners' });
  }
};
