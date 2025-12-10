import { Router } from 'express';
import { getProfile, updateProfile, getPropertyCategories, getApprovedAgents, getAdmins, deleteAccount } from '../controllers/userController';
import { getSignedUploadUrl } from '../controllers/uploadController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/me', authenticateToken, getProfile);
router.get('/profile', authenticateToken, getProfile);
router.put('/profile', authenticateToken, updateProfile);
router.get('/categories', authenticateToken, getPropertyCategories);
router.get('/agents', authenticateToken, getApprovedAgents);
router.get('/admins', authenticateToken, getAdmins);
router.post('/upload-url', authenticateToken, getSignedUploadUrl);
router.delete('/account', authenticateToken, deleteAccount);

export default router;
