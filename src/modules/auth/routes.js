import { Router } from 'express';
import { 
  registerTenant, 
  login, 
  logout, 
  getSessionProfile, 
  forgotPassword, 
  resetPassword, 
  changePassword,
  refreshToken
} from './controller.js';
import { 
  registerTenantSchema, 
  loginSchema, 
  forgotPasswordSchema, 
  resetPasswordSchema, 
  changePasswordSchema,
  refreshTokenSchema
} from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';
import { tenantResolver } from '../../middleware/tenant.middleware.js';
import { createRateLimiter } from '../../middleware/rate-limiter.middleware.js';

const router = Router();

const loginLimiter = createRateLimiter({ limit: 10, prefix: 'rl:login' });
const forgotLimiter = createRateLimiter({ limit: 3, prefix: 'rl:forgot' });

// Public routes
router.post('/register-tenant', validate(registerTenantSchema), registerTenant);
router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/refresh', validate(refreshTokenSchema), refreshToken);
router.post('/forgot-password', forgotLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', forgotLimiter, validate(resetPasswordSchema), resetPassword);

// Authenticated routes
router.post('/logout', authenticate, tenantResolver, logout);
router.get('/me', authenticate, tenantResolver, getSessionProfile);
router.post('/change-password', authenticate, tenantResolver, validate(changePasswordSchema), changePassword);

export default router;
