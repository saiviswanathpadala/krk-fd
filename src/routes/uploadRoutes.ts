import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { getSignedUploadUrl, completeUpload } from '../controllers/uploadController';

const router = Router();

router.use(authenticateToken);

router.post('/signed-url', getSignedUploadUrl);
router.post('/:uploadId/complete', completeUpload);

export default router;