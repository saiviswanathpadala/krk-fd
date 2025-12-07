import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  createConversation,
  getConversations,
  getMessages,
  sendMessage,
  deleteConversation,
  n8nWebhook,
} from '../controllers/chatController';

const router = Router();

router.post('/conversations', authenticateToken, createConversation);
router.get('/conversations', authenticateToken, getConversations);
router.get('/conversations/:cid/messages', authenticateToken, getMessages);
router.post('/conversations/:cid/messages', authenticateToken, sendMessage);
router.delete('/conversations/:cid', authenticateToken, deleteConversation);
router.post('/integrations/n8n/webhook', n8nWebhook);

export default router;
