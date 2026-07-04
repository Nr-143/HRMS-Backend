import { Router } from 'express';
import { registerTenant, login, logout, getSessionProfile } from './controller.js';
import { registerTenantSchema, loginSchema } from './validation.js';
import { validate } from '../../middleware/validation.middleware.js';
import { authenticate } from '../../middleware/auth.middleware.js';

const router = Router();

// Public routes
router.post('/register-tenant', validate(registerTenantSchema), registerTenant);
router.post('/login', validate(loginSchema), login);

// Authenticated routes
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getSessionProfile);

export default router;
