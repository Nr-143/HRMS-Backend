import { AsyncLocalStorage } from 'async_hooks';

/**
 * Singleton instance of AsyncLocalStorage to track request-scoped context
 * (such as tenantId, userId, and role) across asynchronous execution flows.
 * @type {AsyncLocalStorage<{ tenantId: string, userId: string, role: string }>}
 */
export const contextStorage = new AsyncLocalStorage();

/**
 * Retrieves the current request context from the active store.
 *
 * @returns {{ tenantId: string, userId: string, role: string }|null} The current store context object, or null if called outside an active execution context.
 */
export const getContext = () => {
  return contextStorage.getStore() || null;
};

/**
 * Wraps execution of a function in a new asynchronous context.
 *
 * @param {{ tenantId: string, userId: string, role: string }} context - The context object to store.
 * @param {Function} fn - The callback function to execute within the context.
 * @returns {*} The return value of the executed callback function.
 */
export const runWithContext = (context, fn) => {
  return contextStorage.run(context, fn);
};

/**
 * Shortcut helper to retrieve the tenant ID from the current context.
 *
 * @returns {string|null} The tenant ID string, or null if called outside a context or if tenantId is missing.
 */
export const getTenantId = () => {
  return getContext()?.tenantId ?? null;
};

/**
 * Shortcut helper to retrieve the user's role from the current context.
 *
 * @returns {string|null} The user's role string, or null if called outside a context or if role is missing.
 */
export const getRole = () => {
  return getContext()?.role ?? null;
};
