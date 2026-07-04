import { Router } from 'express';
import { sendNotification } from './controller.js';
import { sendNotificationSchema } from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';

const router = Router();

// Apply auth and tenant validations
router.use(authenticate);
router.use(tenantResolver);

router.post('/', validate(sendNotificationSchema), sendNotification);

export default router;
