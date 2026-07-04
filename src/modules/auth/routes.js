import { Router } from 'express';
import { 
  registerTenant, 
  login, 
  logout, 
  getSessionProfile, 
  forgotPassword, 
  resetPassword, 
  changePassword 
} from './controller.js';
import { 
  registerTenantSchema, 
  loginSchema, 
  forgotPasswordSchema, 
  resetPasswordSchema, 
  changePasswordSchema 
} from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = Router();

// Public routes
router.post('/register-tenant', validate(registerTenantSchema), registerTenant);
router.post('/login', validate(loginSchema), login);
router.post('/forgot-password', validate(forgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(resetPasswordSchema), resetPassword);

// Authenticated routes
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getSessionProfile);
router.post('/change-password', authenticate, validate(changePasswordSchema), changePassword);

export default router;
