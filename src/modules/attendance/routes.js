import { Router } from 'express';
import {
  clockIn,
  clockOut,
  getMyAttendance,
  getEmployeeLogs,
  getMonthlySummary,
  getLiveAttendance,
} from './controller.js';
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
router.get('/my', getMyAttendance);
router.get('/summary', getMonthlySummary);
router.get('/live', getLiveAttendance);
router.get('/employee/:employeeId', getEmployeeLogs);

export default router;
