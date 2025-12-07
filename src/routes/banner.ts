import { Router } from 'express';
import { getBanners } from '../controllers/bannerController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, getBanners);

export default router;
