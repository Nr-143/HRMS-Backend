import { Router } from 'express';
import {
  createEmployee,
  getAllEmployees,
  getEmployeeById,
  updateEmployee,
  deleteEmployee,
  reactivateEmployee,
  getOrgChart,
} from './controller.js';
import { createEmployeeSchema, updateEmployeeSchema, idParamSchema } from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';
import { authorize } from '../../rbac/index.js';

const router = Router();

router.use(authenticate);
router.use(tenantResolver);

// Static routes before parameterised routes to prevent shadowing
router.get('/org-chart',              authorize('employee', 'read'),   getOrgChart);

router.post('/',                      validate(createEmployeeSchema),  authorize('employee', 'write'),  createEmployee);
router.get('/',                       authorize('employee', 'read'),   getAllEmployees);
router.get('/:id',   validate(idParamSchema), authorize('employee', 'read'),   getEmployeeById);
router.patch('/:id', validate(updateEmployeeSchema), authorize('employee', 'write'),  updateEmployee);
router.delete('/:id', validate(idParamSchema), authorize('employee', 'delete'), deleteEmployee);
router.patch('/:id/reactivate', validate(idParamSchema), authorize('employee', 'delete'), reactivateEmployee);

export default router;
