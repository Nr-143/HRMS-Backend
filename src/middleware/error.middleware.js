import { sendError } from '../utils/response.utils.js';
import { env } from '../config/env.js';

/**
 * Express Error-Handling Middleware.
 * Standardizes raw database, system, or custom errors into normalized API payloads.
 */
export const errorHandler = (err, req, res, next) => {
  // If headers are already sent, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle Prisma Database Errors specifically
  if (err.code && err.code.startsWith('P')) {
    let customError = {
      statusCode: 400,
      status: 'fail',
      message: 'Database operation failed',
    };

    if (err.code === 'P2002') {
      customError.statusCode = 409;
      customError.message = 'A record with this information already exists';
      if (env.NODE_ENV === 'development') {
        customError.debugInfo = `Unique constraint failed on field(s): ${err.meta?.target || 'unknown'}`;
      }
    } else if (err.code === 'P2025') {
      customError.statusCode = 404;
      customError.message = 'The requested database record does not exist';
    }

    // Merge standard properties while retaining database details
    err = Object.assign(err, customError);
  }

  // Print stack trace for unhandled errors
  if (!err.isOperational) {
    console.error(' Unhandled Non-Operational Error:', err);
  }

  sendError(res, err);
};
