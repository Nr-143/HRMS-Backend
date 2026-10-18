import { Router } from 'express';
import {
  createEmployee,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  reactivateEmployee,
  getOrgChart,
  updateReportingManager,
  getReportingHistory,
} from './controller.js';
import { createEmployeeSchema, updateEmployeeSchema, idParamSchema, updateReportingManagerSchema } from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';
import { checkSubscription, checkEmployeeLimit } from '../../middleware/subscription.middleware.js';
import { authorize } from '../../rbac/index.js';
import { ForbiddenError } from '../../utils/error.utils.js';

const router = Router();

router.use(authenticate);
router.use(tenantResolver);
router.use(checkSubscription);

const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new ForbiddenError(`Access denied. Required roles: ${roles.join(', ')}`));
  }
  next();
};

// Static routes before parameterised routes to prevent shadowing
router.get('/org-chart',              authorize('employee', 'read'),   getOrgChart);

router.post('/',                      validate(createEmployeeSchema),  checkEmployeeLimit, authorize('employee', 'write'),  createEmployee);
router.get('/',                       authorize('employee', 'read'),   getAllEmployees);
router.get('/:id',   validate(idParamSchema), authorize('employee', 'read'),   getEmployeeById);
router.patch('/:id', validate(updateEmployeeSchema), authorize('employee', 'write'),  updateEmployee);
router.delete('/:id', validate(idParamSchema), authorize('employee', 'delete'), deleteEmployee);
router.patch('/:id/reactivate', validate(idParamSchema), authorize('employee', 'delete'), reactivateEmployee);

// Dedicated reporting manager & audit history routes
router.patch('/:id/reporting-manager', validate(updateReportingManagerSchema), allowRoles('SUPER_ADMIN', 'OWNER_ADMIN', 'ADMIN', 'HR'), updateReportingManager);
router.get('/:id/reporting-history', validate(idParamSchema), allowRoles('SUPER_ADMIN', 'OWNER_ADMIN', 'ADMIN', 'HR', 'MANAGER'), getReportingHistory);

export default router;
