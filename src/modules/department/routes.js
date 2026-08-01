import { Router } from 'express';
import {
  createDepartment,
  batchCreateDepartments,
  getAllDepartments,
  updateDepartment,
  deleteDepartment,
  assignHOD,
  removeHOD,
  getManagersByDepartment,
} from './controller.js';
import {
  createDepartmentSchema,
  batchCreateDepartmentSchema,
  updateDepartmentSchema,
  idParamSchema,
  assignHodSchema,
} from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';
import { checkSubscription } from '../../middleware/subscription.middleware.js';
import { authorize } from '../../rbac/index.js';
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

router.post('/',                      validate(createDepartmentSchema),      authorize('department', 'write'),  createDepartment);
router.post('/batch',                 validate(batchCreateDepartmentSchema),  authorize('department', 'write'),  batchCreateDepartments);
router.get('/',                                                               authorize('department', 'read'),   getAllDepartments);
router.put('/:id',                   validate(updateDepartmentSchema),        authorize('department', 'write'),  updateDepartment);
router.delete('/:id',                validate(idParamSchema),                 authorize('department', 'delete'), deleteDepartment);

// HOD & Department Managers routes
router.patch('/:id/hod',             validate(assignHodSchema),               allowRoles('SUPER_ADMIN', 'OWNER_ADMIN', 'ADMIN', 'HR'), assignHOD);
router.delete('/:id/hod',            validate(idParamSchema),                 allowRoles('SUPER_ADMIN', 'OWNER_ADMIN', 'ADMIN', 'HR'), removeHOD);
router.get('/:id/managers',          validate(idParamSchema),                 getManagersByDepartment);

export default router;
