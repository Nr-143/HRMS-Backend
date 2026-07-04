import { Router } from 'express';
import { clockIn, clockOut, getEmployeeLogs } from './controller.js';
import { clockInSchema, clockOutSchema } from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';

const router = Router();

// Apply auth and tenant validations
router.use(authenticate);
router.use(tenantResolver);

router.post('/clock-in', validate(clockInSchema), clockIn);
router.post('/clock-out', validate(clockOutSchema), clockOut);
router.get('/employee/:employeeId', getEmployeeLogs);

export default router;
