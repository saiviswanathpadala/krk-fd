import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  createOrGetConversation,
  getConversationMessages,
  sendMessage,
  updateMessageStatus,
  getUserConversations,
} from '../controllers/personChatController';

const router = Router();

router.use(authenticateToken);

router.post('/conversations', createOrGetConversation);
router.get('/conversations', getUserConversations);
router.get('/conversations/:conversationId/messages', getConversationMessages);
router.post('/conversations/:conversationId/messages', sendMessage);
router.post('/conversations/:conversationId/messages/:messageId/status', updateMessageStatus);

export default router;
