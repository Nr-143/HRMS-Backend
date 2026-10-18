import { Router } from 'express';
import { getRoles, getPermissions, updateUserRole } from './controller.js';
import { updateUserRoleSchema } from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
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

// GET /api/v1/roles -> list roles & tenant counts
router.get('/', getRoles);

// GET /api/v1/permissions -> system permissions matrix
router.get('/permissions', getPermissions);

// PATCH /api/v1/users/:id/role -> assign/update user role (supports both /api/v1/users/:id/role and /api/v1/roles/users/:id/role)
router.patch('/:id/role', validate(updateUserRoleSchema), allowRoles('SUPER_ADMIN', 'OWNER_ADMIN', 'ADMIN'), updateUserRole);
router.patch('/users/:id/role', validate(updateUserRoleSchema), allowRoles('SUPER_ADMIN', 'OWNER_ADMIN', 'ADMIN'), updateUserRole);

export default router;
