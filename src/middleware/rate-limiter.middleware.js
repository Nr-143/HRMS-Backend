import redisClient from '../config/redis.js';
import { AppError } from '../utils/error.utils.js';

/**
 * Redis-based Rate Limiter.
 * Restricts client requests per minute to prevent abuse.
 * Falls back to open access if Redis is unavailable.
 */
export const createRateLimiter = ({ limit = 100, windowSeconds = 60, prefix = 'rl' } = {}) => {
  return async (req, res, next) => {
    try {
      // If Redis connection is not established or ready, bypass rate limiter
      if (!redisClient.isReady) {
        return next();
      }

      const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      const rateLimitKey = `${prefix}:${clientIp}`;

      const requestCount = await redisClient.incr(rateLimitKey);

      if (requestCount === 1) {
        await redisClient.expire(rateLimitKey, windowSeconds);
      }

      if (requestCount > limit) {
        return next(new AppError('Too many requests. Please try again later.', 429));
      }

      next();
    } catch (error) {
      console.error('⚠️ Rate Limiter Error (Failing Open):', error.message);
      next(); // Fail open to maintain user service availability
    }
  };
};

export const rateLimiter = createRateLimiter(); // Default global rate limiter
