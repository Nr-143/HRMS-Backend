import { Router } from 'express';
import { createEmployee, updateEmployee, getEmployeeById, getAllEmployees } from './controller.js';
import { createEmployeeSchema, updateEmployeeSchema, getEmployeeSchema } from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';
import { authorize } from '../../rbac/index.js';

const router = Router();

// Apply auth and tenant validation to all employee paths
router.use(authenticate);
router.use(tenantResolver);

router.post('/', validate(createEmployeeSchema), authorize('employee', 'write'), createEmployee);
router.get('/', authorize('employee', 'read'), getAllEmployees);
router.get('/:id', validate(getEmployeeSchema), authorize('employee', 'read'), getEmployeeById);
router.put('/:id', validate(updateEmployeeSchema), authorize('employee', 'write'), updateEmployee);

export default router;
