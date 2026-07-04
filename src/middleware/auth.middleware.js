import { authService } from '../modules/auth/index.js';
import { UnauthorizedError } from '../utils/error.utils.js';
import { contextStorage } from '../utils/context.utils.js';

/**
 * Middleware to enforce JWT session validation.
 * Delegates the verification process directly to the Auth module facade.
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token is missing or malformed');
    }

    const token = authHeader.split(' ')[1];
    const userPayload = await authService.verifySession(token);

    // Bind authentication data to Request context
    req.user = userPayload;

    // Optional safety check: If tenant context is resolved, it must match user tenant context
    if (req.tenantId && req.tenantId !== userPayload.tenantId) {
      throw new UnauthorizedError('Cross-tenant data access is forbidden');
    }

    // Run subsequent request steps inside AsyncLocalStorage context
    contextStorage.run({
      id: userPayload.sub,
      tenantId: userPayload.tenantId,
      role: userPayload.role,
    }, () => {
      next();
    });
  } catch (error) {
    // Catch JSON Web Token errors and wrap them in a standard UnauthorizedError
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(new UnauthorizedError('Access token has expired or is invalid'));
    }
    next(error);
  }
};
