import { Router } from 'express';
import {
  getSettings,
  updateGeneralSettings,
  updateWorkRules,
  updateLeavePolicy,
  updateNotificationSettings,
  testSlackWebhook,
} from './controller.js';
import {
  updateGeneralSettingsSchema,
  updateWorkRulesSchema,
  updateLeavePolicySchema,
  updateNotificationSettingsSchema,
  testWebhookSchema,
} from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';
import { checkSubscription } from '../../middleware/subscription.middleware.js';
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

// Control panel operations are strictly reserved for OWNER_ADMIN and ADMIN
router.use(allowRoles('SUPER_ADMIN', 'OWNER_ADMIN', 'ADMIN'));

router.get('/', getSettings);
router.patch('/general', validate(updateGeneralSettingsSchema), updateGeneralSettings);
router.patch('/work-rules', validate(updateWorkRulesSchema), updateWorkRules);
router.patch('/leave-policy', validate(updateLeavePolicySchema), updateLeavePolicy);
router.patch('/notifications', validate(updateNotificationSettingsSchema), updateNotificationSettings);
router.post('/test-webhook', validate(testWebhookSchema), testSlackWebhook);

export default router;

