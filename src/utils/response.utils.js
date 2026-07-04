import { env } from '../config/env.js';

/**
 * Standardized Success Response Utility
 */
export const sendSuccess = (res, data = null, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    status: 'success',
    message,
    data,
  });
};

/**
 * Standardized Error Response Utility
 */
export const sendError = (res, error) => {
  const statusCode = error.statusCode || 500;
  const status = error.status || 'error';
  const message = error.message || 'Internal Server Error';

  const responseBody = {
    status,
    message,
  };

  // If there are detailed validation errors, attach them
  if (error.errors && error.errors.length > 0) {
    responseBody.errors = error.errors;
  }

  // Include stack trace only in development environment
  if (env.NODE_ENV === 'development') {
    responseBody.stack = error.stack;
  }

  return res.status(statusCode).json(responseBody);
};
