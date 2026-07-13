import { z } from 'zod';
import { BadRequestError } from '../utils/error.utils.js';

const uuidSchema = z.string().uuid();

/**
 * Middleware to extract the Tenant ID from headers and bind to the request context.
 * Enables SaaS multi-tenancy separation.
 */
export const tenantResolver = (req, res, next) => {
  // Exclude tenant verification for health checks or tenant registration
  const bypassPaths = [
    '/health',
    '/api/v1/auth/register-tenant',
    '/api/v1/auth/login',
  ];

  if (bypassPaths.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const tenantId = req.headers['x-tenant-id'];

  if (!tenantId) {
    return next(new BadRequestError('Tenant context is missing. Please provide the X-Tenant-ID header.'));
  }

  const result = uuidSchema.safeParse(tenantId);
  if (!result.success) {
    return next(new BadRequestError('Invalid X-Tenant-ID format. Must be a valid UUID.'));
  }

  req.tenantId = result.data;
  next();
};
