import jwt from 'jsonwebtoken';
import { sendError } from '../utils/response.utils.js';
import { contextStorage } from '../utils/context.utils.js';

// PHASE 1: This middleware verifies the JWT and sets AsyncLocalStorage context.
// PHASE 3 (microservices): Replace this with tenant.middleware.js which reads
// X-Tenant-ID header instead of verifying JWT. The contextStorage.run() call
// is identical — only the source of tenantId changes.

export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    // 1. Extract Bearer token from Authorization header and check format
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'NO_TOKEN',
          message: 'Access token is missing or malformed'
        }
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Use JWT_ACCESS_SECRET from environment (with fallback to JWT_SECRET)
    const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'hrms-super-secret-key-change-me-in-production';

    // 2. Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Access token has expired'
          }
        });
      }
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Access token is invalid or corrupted'
        }
      });
    }

    // 3. Attach decoded payload to req.user
    req.user = decoded;

    // 4. Run subsequent steps within the context Storage
    contextStorage.run({
      tenantId: decoded.tenantId || decoded.companyId,
      userId: decoded.sub,
      role: decoded.role,
    }, () => {
      next();
    });
  } catch (error) {
    // Fallback error handler
    return sendError(res, error);
  }
};
