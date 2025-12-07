import { Router } from 'express';
import { authenticateToken, ensureAdmin } from '../middleware/auth';
import { getDashboardStats } from '../controllers/dashboardController';
import { getAdminProfile, updateAdminProfile, logout } from '../controllers/adminProfileController';
import {
  getCustomers,
  getCustomerById,
  deleteCustomer,
  bulkDeleteCustomers,
} from '../controllers/adminCustomerController';
import {
  getAgents,
  getAgentById,
  approveAgent,
  rejectAgent,
  deleteAgent,
  bulkDeleteAgents,
} from '../controllers/adminAgentController';
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  reassignAndDeleteEmployee,
  deleteEmployee,
  getPropertiesLookup,
  getAgentsLookup,
} from '../controllers/adminEmployeeController';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(ensureAdmin);

// Admin profile endpoints
router.get('/profile', getAdminProfile);
router.put('/profile', updateAdminProfile);
router.post('/logout', logout);

// Dashboard stats endpoint
router.get('/dashboard/stats', getDashboardStats);

// Customer management endpoints
router.get('/customers', getCustomers);
router.get('/customers/:id', getCustomerById);
router.delete('/customers/:id', deleteCustomer);
router.delete('/customers', bulkDeleteCustomers);

// Agent management endpoints
router.get('/agents', getAgents);
router.get('/agents/:id', getAgentById);
router.post('/agents/:id/approve', approveAgent);
router.post('/agents/:id/reject', rejectAgent);
router.delete('/agents/:id', deleteAgent);
router.delete('/agents', bulkDeleteAgents);

// Employee management endpoints
router.get('/employees', getEmployees);
router.get('/employees/:id', getEmployeeById);
router.post('/employees', createEmployee);
router.patch('/employees/:id', updateEmployee);
router.post('/employees/:id/reassign-and-delete', reassignAndDeleteEmployee);
router.delete('/employees/:id', deleteEmployee);

// Lookup endpoints for assignments
router.get('/lookup/properties', getPropertiesLookup);
router.get('/lookup/agents', getAgentsLookup);

// Property management endpoints
import {
  getAdminProperties,
  getAdminPropertyById,
  createAdminProperty,
  updateAdminProperty,
  deleteAdminProperty,
  approvePendingChange,
  rejectPendingChange,
  createAdminPropertyDraft,
  updateAdminDraft,
  submitAdminDraft,
  discardAdminDraft,
} from '../controllers/adminPropertyController';

router.get('/properties', getAdminProperties);
router.get('/properties/:id', getAdminPropertyById);
router.post('/properties', createAdminProperty);
router.put('/properties/:id', updateAdminProperty);
router.delete('/properties/:id', deleteAdminProperty);
router.post('/properties/draft', createAdminPropertyDraft);
router.post('/properties/:id/draft', createAdminPropertyDraft);
router.put('/drafts/:draftId', updateAdminDraft);
router.post('/drafts/:draftId/submit', submitAdminDraft);
router.delete('/drafts/:draftId', discardAdminDraft);
router.post('/properties/:id/approve-change/:changeId', approvePendingChange);
router.post('/properties/reject-change/:changeId', rejectPendingChange);

// Banner management endpoints
import {
  getAdminBanners,
  createAdminBanner,
  updateAdminBanner,
  deleteAdminBanner,
  reorderBanners,
} from '../controllers/adminBannerController';

router.get('/banners', getAdminBanners);
router.post('/banners', createAdminBanner);
router.put('/banners/:id', updateAdminBanner);
router.delete('/banners/:id', deleteAdminBanner);
router.post('/banners/reorder', reorderBanners);

// Pending changes moderation endpoints
import {
  getPendingChanges,
  getPendingChangeById,
  approvePendingChange as approvePendingChangeNew,
  rejectPendingChange as rejectPendingChangeNew,
  requestChanges,
} from '../controllers/adminPendingChangesController';

router.get('/pending-changes', getPendingChanges);
router.get('/pending-changes/:changeId', getPendingChangeById);
router.post('/pending-changes/:changeId/approve', approvePendingChangeNew);
router.post('/pending-changes/:changeId/reject', rejectPendingChangeNew);
router.post('/pending-changes/:changeId/request-changes', requestChanges);

// Admin loan request management endpoints
import {
  getAdminLoanRequests,
  getAdminLoanRequestById,
  reassignLoanRequest,
  bulkReassignLoanRequests,
  escalateLoanRequest,
  bulkEscalateLoanRequests,
  changeAdminLoanRequestStatus,
  addAdminLoanRequestComment,
  requestExport,
  getAdminLoanRequestStats,
  getFinanceEmployees,
  getSlaConfig,
  updateSlaConfig,
} from '../controllers/adminLoanRequestController';

router.get('/loan-requests', getAdminLoanRequests);
router.get('/loan-requests/stats', getAdminLoanRequestStats);
router.get('/loan-requests/finance-employees', getFinanceEmployees);
router.get('/loan-requests/sla-config', getSlaConfig);
router.put('/loan-requests/sla-config', updateSlaConfig);
router.get('/loan-requests/:id', getAdminLoanRequestById);
router.post('/loan-requests/:id/reassign', reassignLoanRequest);
router.post('/loan-requests/bulk-reassign', bulkReassignLoanRequests);
router.post('/loan-requests/:id/escalate', escalateLoanRequest);
router.post('/loan-requests/bulk-escalate', bulkEscalateLoanRequests);
router.post('/loan-requests/:id/status', changeAdminLoanRequestStatus);
router.post('/loan-requests/:id/comment', addAdminLoanRequestComment);
router.post('/loan-requests/export', requestExport);

export default router;
