import { Router } from 'express';
import { requestLeave, reviewLeave, getEmployeeLeaves } from './controller.js';
import { requestLeaveSchema, reviewLeaveSchema } from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';
import { authorize } from '../../rbac/index.js';

const router = Router();

// Apply auth and tenant validations
router.use(authenticate);
router.use(tenantResolver);

router.post('/', validate(requestLeaveSchema), authorize('leave', 'write'), requestLeave);
router.patch('/:id/review', validate(reviewLeaveSchema), authorize('leave', 'approve'), reviewLeave);
router.get('/employee/:employeeId', authorize('leave', 'read'), getEmployeeLeaves);

export default router;
