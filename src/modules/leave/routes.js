import { Router } from 'express';
import {
  applyLeave,
  getLeaves,
  getLeaveById,
  approveLeave,
  rejectLeave,
  cancelLeave,
  getMyBalance,
  getEmployeeBalance,
} from './controller.js';
import { applyLeaveSchema, rejectLeaveSchema, idParamSchema, employeeIdParamSchema } from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';
import { checkSubscription } from '../../middleware/subscription.middleware.js';
import { authorize } from '../../rbac/index.js';

const router = Router();

router.use(authenticate);
router.use(tenantResolver);
router.use(checkSubscription);

// Static routes before /:id to prevent shadowing
router.get('/balance',                                                    authorize('leave', 'read'),    getMyBalance);
router.get('/balance/:employeeId', validate(employeeIdParamSchema),       authorize('leave', 'read'),    getEmployeeBalance);

router.post('/',                   validate(applyLeaveSchema),            authorize('leave', 'write'),   applyLeave);
router.get('/',                                                           authorize('leave', 'read'),    getLeaves);
router.get('/:id',                 validate(idParamSchema),               authorize('leave', 'read'),    getLeaveById);
router.post('/:id/approve',        validate(idParamSchema),               authorize('leave', 'approve'), approveLeave);
router.post('/:id/reject',         validate(rejectLeaveSchema),           authorize('leave', 'approve'), rejectLeave);
router.post('/:id/cancel',         validate(idParamSchema),               authorize('leave', 'write'),   cancelLeave);

export default router;
