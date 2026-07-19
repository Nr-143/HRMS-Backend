import { Router } from 'express';
import { createDesignation, batchCreateDesignations, getAllDesignations, updateDesignation, deleteDesignation } from './controller.js';
import { createDesignationSchema, batchCreateDesignationSchema, updateDesignationSchema, idParamSchema } from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';
import { checkSubscription } from '../../middleware/subscription.middleware.js';
import { authorize } from '../../rbac/index.js';

const router = Router();

router.use(authenticate);
router.use(tenantResolver);
router.use(checkSubscription);

router.post('/',       validate(createDesignationSchema),      authorize('designation', 'write'),  createDesignation);
router.post('/batch',  validate(batchCreateDesignationSchema),  authorize('designation', 'write'),  batchCreateDesignations);
router.get('/',                                                 authorize('designation', 'read'),   getAllDesignations);
router.put('/:id',    validate(updateDesignationSchema),        authorize('designation', 'write'),  updateDesignation);
router.delete('/:id', validate(idParamSchema),                  authorize('designation', 'delete'), deleteDesignation);

export default router;
