import { Router } from 'express';
import { createEmployee, updateEmployee, getEmployeeById, getAllEmployees } from './controller.js';
import { createEmployeeSchema, updateEmployeeSchema, getEmployeeSchema } from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';

const router = Router();

// Apply auth and tenant validation to all employee paths
router.use(authenticate);
router.use(tenantResolver);

router.post('/', validate(createEmployeeSchema), createEmployee);
router.get('/', getAllEmployees);
router.get('/:id', validate(getEmployeeSchema), getEmployeeById);
router.put('/:id', validate(updateEmployeeSchema), updateEmployee);

export default router;
