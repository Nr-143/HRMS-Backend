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

const allowRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new ForbiddenError(`Access denied. Required roles: ${roles.join(', ')}`));
  }
  next();
};

// GET /dashboard/admin -> authenticate, checkSubscription, allowRoles('OWNER_ADMIN','ADMIN','HR')
router.get('/admin', allowRoles('OWNER_ADMIN', 'ADMIN', 'HR'), getAdminDashboard);

// GET /dashboard/manager -> authenticate, checkSubscription, allowRoles('OWNER_ADMIN','ADMIN','HR','MANAGER')
router.get('/manager', allowRoles('OWNER_ADMIN', 'ADMIN', 'HR', 'MANAGER'), getManagerDashboard);

// GET /dashboard/employee -> authenticate, checkSubscription (all roles can see own employee dashboard)
router.get('/employee', getEmployeeDashboard);

export default router;
