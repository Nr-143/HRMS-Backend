import { Router } from 'express';
import { getAdminDashboard, getManagerDashboard, getEmployeeDashboard } from './controller.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';
import { checkSubscription } from '../../middleware/subscription.middleware.js';
import { ForbiddenError } from '../../utils/error.utils.js';

const router = Router();

router.use(authenticate);
router.use(tenantResolver);
router.use(checkSubscription);

/**
 * Inline role guard — dashboard endpoints are not in the RBAC abilities matrix.
 * Simpler than adding a 'dashboard' resource to abilities.js for 3 read-only endpoints.
 */
const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new ForbiddenError(`Access denied. Required roles: ${roles.join(', ')}`));
  }
  next();
};

router.get('/admin',    allowRoles('OWNER_ADMIN', 'ADMIN', 'HR'),  getAdminDashboard);
router.get('/manager',  allowRoles('MANAGER'),                      getManagerDashboard);
router.get('/employee', allowRoles('EMPLOYEE'),                     getEmployeeDashboard);

export default router;
