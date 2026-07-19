import { Router } from 'express';
import { clockIn, clockOut, getMyAttendance, getEmployeeAttendance, getMonthlySummary, getLiveAttendance } from './controller.js';
import { clockInSchema, clockOutSchema, employeeIdParamSchema, summaryQuerySchema } from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';
import { authorize } from '../../rbac/index.js';

const router = Router();

router.use(authenticate);
router.use(tenantResolver);

// Static routes first — prevent shadowing by /:id
router.post('/clock-in',              validate(clockInSchema),           authorize('attendance', 'write'), clockIn);
router.post('/clock-out',             validate(clockOutSchema),          authorize('attendance', 'write'), clockOut);
router.get('/my',                                                        authorize('attendance', 'read'),  getMyAttendance);
router.get('/live',                                                      authorize('attendance', 'read'),  getLiveAttendance);
router.get('/summary',                validate(summaryQuerySchema),      authorize('attendance', 'read'),  getMonthlySummary);
router.get('/employee/:id',           validate(employeeIdParamSchema),   authorize('attendance', 'read'),  getEmployeeAttendance);

export default router;
