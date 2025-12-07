import { Router } from 'express';
import { 
  createLoanRequest, 
  getAdminLoanRequests,
  getFinanceLoanRequests,
  getFinanceLoanRequestById,
  takeLoanRequest,
  updateLoanRequestStatus,
  addLoanRequestComment,
  getFinanceLoanRequestStats,
} from '../controllers/loanRequestController';
import { authenticateToken, ensureFinanceDepartment } from '../middleware/auth';

const router = Router();

router.post('/', authenticateToken, createLoanRequest);
router.get('/admin', authenticateToken, getAdminLoanRequests);
router.get('/finance', authenticateToken, ensureFinanceDepartment, getFinanceLoanRequests);
router.get('/finance/stats', authenticateToken, ensureFinanceDepartment, getFinanceLoanRequestStats);
router.get('/finance/:id', authenticateToken, ensureFinanceDepartment, getFinanceLoanRequestById);
router.post('/finance/:id/take', authenticateToken, ensureFinanceDepartment, takeLoanRequest);
router.post('/finance/:id/status', authenticateToken, ensureFinanceDepartment, updateLoanRequestStatus);
router.post('/finance/:id/comment', authenticateToken, ensureFinanceDepartment, addLoanRequestComment);

export default router;
