import { Router } from 'express';
import {
  handleGetActiveQuote,
  handleGetAllQuotes,
  handleCreateQuote,
  handleUpdateQuote,
  handleSetActiveQuote,
  handleDeleteQuote,
} from './controller.js';
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

// All authenticated users can fetch active and all quotes
router.get('/active', handleGetActiveQuote);
router.get('/', handleGetAllQuotes);

// Only Owner, Admin, HR can create, edit, activate, or delete quotes
router.post('/', allowRoles('SUPER_ADMIN', 'OWNER_ADMIN', 'ADMIN', 'HR'), handleCreateQuote);
router.put('/:id', allowRoles('SUPER_ADMIN', 'OWNER_ADMIN', 'ADMIN', 'HR'), handleUpdateQuote);
router.patch('/:id/active', allowRoles('SUPER_ADMIN', 'OWNER_ADMIN', 'ADMIN', 'HR'), handleSetActiveQuote);
router.delete('/:id', allowRoles('SUPER_ADMIN', 'OWNER_ADMIN', 'ADMIN', 'HR'), handleDeleteQuote);

export default router;
