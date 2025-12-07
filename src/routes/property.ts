import { Router } from 'express';
import { getProperties, getPropertyById } from '../controllers/propertyController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, getProperties);
router.get('/:id', authenticateToken, getPropertyById);

export default router;