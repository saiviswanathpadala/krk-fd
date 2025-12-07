import { Router } from 'express';
import { authenticateToken, ensureEmployee } from '../middleware/auth';
import { getEmployeeDashboardStats } from '../controllers/employeeDashboardController';
import { updateEmployeeProfile, logout } from '../controllers/employeeProfileController';
import { getEmployeeActivity } from '../controllers/employeeActivityController';

const router = Router();

// All employee routes require authentication and employee role
router.use(authenticateToken);
router.use(ensureEmployee);

// Employee dashboard stats endpoint
router.get('/dashboard/stats', getEmployeeDashboardStats);

// Employee profile endpoints
router.put('/profile', updateEmployeeProfile);
router.post('/logout', logout);

// Employee activity endpoint
router.get('/activity', getEmployeeActivity);

// Employee property endpoints
import {
  getEmployeeProperties,
  getEmployeePropertyById,
  submitPendingChange,
  getEmployeePendingChanges,
  createProperty,
  withdrawPendingChange,
  updateDraft,
  submitDraft,
  discardDraft
} from '../controllers/employeePropertyController';

router.get('/properties', getEmployeeProperties);
router.post('/properties', createProperty);
router.get('/properties/:id', getEmployeePropertyById);
router.post('/properties/:id/pending-change', submitPendingChange);
router.get('/pending-changes', getEmployeePendingChanges);
router.post('/pending-changes/:changeId/withdraw', withdrawPendingChange);
router.put('/drafts/:changeId', updateDraft);
router.post('/drafts/:changeId/submit', submitDraft);
router.delete('/drafts/:changeId', discardDraft);

// Employee banner endpoints
import {
  getEmployeeBanners,
  getEmployeeBannerById,
  createEmployeeBanner,
  submitBannerPendingChange,
  withdrawBannerPendingChange,
  updateBannerDraft,
  submitBannerDraft,
  discardBannerDraft,
  getEmployeeBannerPendingChanges
} from '../controllers/employeeBannerController';

router.get('/banners', getEmployeeBanners);
router.post('/banners', createEmployeeBanner);
router.get('/banners/:id', getEmployeeBannerById);
router.post('/banners/:id/pending-change', submitBannerPendingChange);
router.get('/banner-pending-changes', getEmployeeBannerPendingChanges);
router.post('/banner-pending-changes/:changeId/withdraw', withdrawBannerPendingChange);
router.put('/banner-drafts/:changeId', updateBannerDraft);
router.post('/banner-drafts/:changeId/submit', submitBannerDraft);
router.delete('/banner-drafts/:changeId', discardBannerDraft);

// Employee agent endpoints
import {
  getEmployeeAgents,
  getEmployeeAgentById,
  getAgentAssignedProperties,
  assignPropertiesToAgent
} from '../controllers/employeeAgentController';

router.get('/agents', getEmployeeAgents);
router.get('/agents/:id', getEmployeeAgentById);
router.get('/agents/:id/assigned-properties', getAgentAssignedProperties);
router.post('/agents/:id/assign-properties', assignPropertiesToAgent);

// Employee customer endpoints
import { getEmployeeCustomerById } from '../controllers/employeeCustomerController';

router.get('/customers/:id', getEmployeeCustomerById);

export default router;