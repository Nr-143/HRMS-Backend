import redisClient from '../config/redis.js';
import { getContext } from './context.utils.js';

export const cache = {
  /**
   * Scopes a key with the active tenant ID from request context.
   * Allows an optional tenantIdOverride parameter.
   */
  getScopedKey(key, tenantIdOverride = null) {
    const context = getContext();
    const tenantId = tenantIdOverride || context?.tenantId;
    if (!tenantId) {
      return `global:${key}`;
    }
    return `tenant:${tenantId}:${key}`;
  },

  async get(key, tenantIdOverride = null) {
    try {
      if (!redisClient.isReady) return null;
      const scopedKey = this.getScopedKey(key, tenantIdOverride);
      const val = await redisClient.get(scopedKey);
      return val ? JSON.parse(val) : null;
    } catch (err) {
      console.error('Cache Get Error:', err.message);
      return null;
    }
  },

  async set(key, value, ttlSeconds = 3600, tenantIdOverride = null) {
    try {
      if (!redisClient.isReady) return;
      const scopedKey = this.getScopedKey(key, tenantIdOverride);
      await redisClient.set(scopedKey, JSON.stringify(value), {
        EX: ttlSeconds,
      });
    } catch (err) {
      console.error('Cache Set Error:', err.message);
    }
  },

  async del(key, tenantIdOverride = null) {
    try {
      if (!redisClient.isReady) return;
      const scopedKey = this.getScopedKey(key, tenantIdOverride);
      await redisClient.del(scopedKey);
    } catch (err) {
      console.error('Cache Del Error:', err.message);
    }
  },
};
export default cache;
