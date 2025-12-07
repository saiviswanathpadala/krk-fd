import { Request, Response } from 'express';
import { dashboardService } from '../services/dashboardService';
import { cacheService } from '../services/cacheService';
import { auditService } from '../services/auditService';

interface AuthRequest extends Request {
  user?: {
    userId: number;
    role?: string;
  };
}

const CACHE_KEY = 'admin:dashboard:stats';
const CACHE_TTL = 60; // 60 seconds

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
  try {
    // Check cache first
    const cached = cacheService.get(CACHE_KEY);
    if (cached) {
      return res.json(cached);
    }

    // Fetch fresh stats
    const stats = await dashboardService.getStats();

    // Cache the result
    cacheService.set(CACHE_KEY, stats, CACHE_TTL);

    // Audit log
    if (req.user) {
      await auditService.log(
        req.user.userId,
        'view_dashboard',
        'dashboard',
        undefined,
        { timestamp: new Date().toISOString() }
      );
    }

    res.json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard stats' });
  }
};

export const invalidateDashboardCache = () => {
  cacheService.invalidate(CACHE_KEY);
};
