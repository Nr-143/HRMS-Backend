import { abilities } from './abilities.js';

/**
 * Resolves the appropriate Prisma query filter based on role abilities.
 * 
 * @param {{ role: string, employeeId: string, tenantId: string }} context - The request user context.
 * @param {string} resource - The target resource (e.g. employee, leave, attendance).
 * @param {string} action - The action being performed (e.g. read, write, delete, approve).
 * @returns {object} Prisma WHERE clause filter object.
 * @throws {{ status: number, code: string, message: string }} Custom 403 error object if unauthorized.
 */
export const getScopeFilter = (context, resource, action) => {
  const role = context?.role;
  const employeeId = context?.employeeId;

  // Verify that the role has mapped permissions for the given resource and action
  if (!role || !abilities[role] || !abilities[role][resource] || !abilities[role][resource][action]) {
    throw {
      status: 403,
      code: 'FORBIDDEN',
      message: `Role ${role || 'UNKNOWN'} is not authorized to ${action} ${resource} resources.`
    };
  }

  const scope = abilities[role][resource][action];

  switch (scope) {
    case 'all':
      return {};
    case 'team':
      // If querying the employee model itself, filter by managerId directly.
      // Otherwise, filter by employee relation's managerId.
      if (resource === 'employee') {
        return { managerId: employeeId };
      }
      return { employee: { managerId: employeeId } };
    case 'self':
      // If querying the employee model itself, check ID matches.
      // Otherwise, check employeeId field matches.
      if (resource === 'employee') {
        return { id: employeeId };
      }
      return { employeeId: employeeId };
    case 'none':
    default:
      throw {
        status: 403,
        code: 'FORBIDDEN',
        message: `Access denied. Role ${role} is not authorized to perform ${action} on ${resource}.`
      };
  }
};
