const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

/**
 * API Gateway Authentication Middleware
 * 
 * JWT is verified HERE and ONLY HERE. Downstream services trust headers, never JWT.
 */
const gatewayAuth = (req, res, next) => {
  try {
    // ------------------------------------------------------------------------
    // Step 1: Strip all internal headers from the client request (Security)
    // Always strip before inject — order matters for security.
    // 
    // CRITICAL SECURITY STEP: This is not optional. It prevents external clients
    // from spoofing tenant or user context by passing these headers directly.
    // ------------------------------------------------------------------------
    delete req.headers['x-tenant-id'];
    delete req.headers['x-user-id'];
    delete req.headers['x-user-role'];
    delete req.headers['x-employee-id'];
    delete req.headers['x-internal-token'];

    // ------------------------------------------------------------------------
    // Step 2: Extract and verify JWT
    // ------------------------------------------------------------------------
    const authHeader = req.headers.authorization;
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
    const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'hrms-super-secret-key-change-me-in-production';

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

    // ------------------------------------------------------------------------
    // Step 3: Inject trusted internal headers
    // ------------------------------------------------------------------------
    req.headers['x-tenant-id'] = decoded.tenantId;
    req.headers['x-user-id'] = decoded.sub;
    req.headers['x-user-role'] = decoded.role;
    req.headers['x-employee-id'] = decoded.employeeId || null;

    // ------------------------------------------------------------------------
    // Step 4: Add a request trace ID
    // Generate a UUID v4 as x-request-id if not already present in request
    // ------------------------------------------------------------------------
    req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();

    // ------------------------------------------------------------------------
    // Step 5: Call next() to proxy to downstream service
    // ------------------------------------------------------------------------
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'GATEWAY_ERROR',
        message: 'Internal Gateway Error'
      }
    });
  }
};

module.exports = gatewayAuth;
