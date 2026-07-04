import { Router } from 'express';
import { requestLeave, reviewLeave, getEmployeeLeaves } from './controller.js';
import { requestLeaveSchema, reviewLeaveSchema } from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';

const router = Router();

// Apply auth and tenant validations
router.use(authenticate);
router.use(tenantResolver);

router.post('/', validate(requestLeaveSchema), requestLeave);
router.patch('/:id/review', validate(reviewLeaveSchema), reviewLeave);
router.get('/employee/:employeeId', getEmployeeLeaves);

export default router;
