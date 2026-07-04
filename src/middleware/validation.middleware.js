import { ValidationError } from '../utils/error.utils.js';

/**
 * Express Middleware factory to validate request payloads against Zod schemas.
 * Replaces req.body, req.query, and req.params with successfully parsed values.
 */
export const validate = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    req.body = parsed.body;
    req.query = parsed.query;
    req.params = parsed.params;
    
    next();
  } catch (error) {
    const formattedErrors = error.errors.map((err) => ({
      field: err.path.join('.').replace(/^(body|query|params)\./, ''),
      message: err.message,
    }));

    next(new ValidationError('Validation parameters failed', formattedErrors));
  }
};
