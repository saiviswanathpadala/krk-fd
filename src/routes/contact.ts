import { Router } from 'express';
import { submitContact, getFAQs } from '../controllers/contactController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/', authenticateToken, submitContact);
router.get('/faq', getFAQs);

export default router;