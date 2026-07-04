import { getScopeFilter } from './policy.engine.js';

/**
 * Express middleware to enforce policy-based authorization.
 * Resolves the query scope filter and attaches it to req.scopeFilter.
 * 
 * @param {string} resource - The target resource (e.g. 'leave').
 * @param {string} action - The action being performed (e.g. 'read').
 * @returns {Function} Express middleware function.
 */
export const authorize = (resource, action) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        throw {
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'Authentication context is missing. Ensure authentication middleware runs first.'
        };
      }

      // Query scope filter generation via the Policy Engine
      const scopeFilter = getScopeFilter(req.user, resource, action);
      
      // Inject the resolved database filter into the request object
      req.scopeFilter = scopeFilter;
      next();
    } catch (err) {
      next(err);
    }
  };
};
