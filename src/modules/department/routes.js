import { Router } from 'express';
import { createDepartment, batchCreateDepartments, getAllDepartments, updateDepartment, deleteDepartment } from './controller.js';
import { createDepartmentSchema, batchCreateDepartmentSchema, updateDepartmentSchema, idParamSchema } from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';
import { authorize } from '../../rbac/index.js';

const router = Router();

router.use(authenticate);
router.use(tenantResolver);

router.post('/',       validate(createDepartmentSchema),      authorize('department', 'write'),  createDepartment);
router.post('/batch',  validate(batchCreateDepartmentSchema),  authorize('department', 'write'),  batchCreateDepartments);
router.get('/',                                                authorize('department', 'read'),   getAllDepartments);
router.put('/:id',    validate(updateDepartmentSchema),        authorize('department', 'write'),  updateDepartment);
router.delete('/:id', validate(idParamSchema),                 authorize('department', 'delete'), deleteDepartment);

export default router;
