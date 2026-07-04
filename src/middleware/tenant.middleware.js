import { contextStorage } from '../utils/context.utils.js';

// This middleware only runs in microservice mode. Never expose microservices directly to the internet — they must sit behind the API Gateway.

export const tenantResolver = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'];
  const userId = req.headers['x-user-id'] || null;
  const role = req.headers['x-user-role'] || null;

  // 1. Read and validate X-Tenant-ID (must be a non-empty string)
  if (!tenantId || typeof tenantId !== 'string' || tenantId.trim() === '') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_TENANT_CONTEXT',
        message: 'Request is missing tenant context. Ensure it came through the API Gateway.'
      }
    });
  }

  // 2. Call contextStorage.run to bind request context variables for downstream database and caching actions
  contextStorage.run({
    tenantId: tenantId.trim(),
    userId: userId ? userId.trim() : null,
    role: role ? role.trim() : null,
  }, () => {
    next();
  });
};
