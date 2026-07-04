/**
 * Permissions Matrix mapping Roles to Resources and Actions with Scope levels.
 * 
 * Scope levels:
 * - 'all'  -> Access to all records within the active tenant context (empty filter: {})
 * - 'team' -> Access to records of direct reports only ({ employee: { managerId: req.user.employeeId } })
 * - 'self' -> Access to the user's own records only ({ employeeId: req.user.employeeId })
 * - 'none' -> Access is completely blocked (results in a 403 Forbidden error)
 */
export const abilities = {
  OWNER_ADMIN: {
    employee:   { read: 'all',  write: 'all',  delete: 'all',  approve: 'none' },
    leave:      { read: 'all',  write: 'all',  delete: 'all',  approve: 'all'  },
    attendance: { read: 'all',  write: 'all',  delete: 'all',  approve: 'none' },
    payroll:    { read: 'all',  write: 'all',  delete: 'all',  approve: 'all'  },
    department: { read: 'all',  write: 'all',  delete: 'all',  approve: 'none' },
    designation:{ read: 'all',  write: 'all',  delete: 'all',  approve: 'none' }
  },
  ADMIN: {
    employee:   { read: 'all',  write: 'all',  delete: 'all',  approve: 'none' },
    leave:      { read: 'all',  write: 'all',  delete: 'none', approve: 'all'  },
    attendance: { read: 'all',  write: 'all',  delete: 'none', approve: 'none' },
    payroll:    { read: 'all',  write: 'all',  delete: 'none', approve: 'none' },
    department: { read: 'all',  write: 'all',  delete: 'all',  approve: 'none' },
    designation:{ read: 'all',  write: 'all',  delete: 'all',  approve: 'none' }
  },
  HR: {
    employee:   { read: 'all',  write: 'all',  delete: 'none', approve: 'none' },
    leave:      { read: 'all',  write: 'all',  delete: 'none', approve: 'all'  },
    attendance: { read: 'all',  write: 'none', delete: 'none', approve: 'none' },
    payroll:    { read: 'all',  write: 'none', delete: 'none', approve: 'none' },
    department: { read: 'all',  write: 'all',  delete: 'none', approve: 'none' },
    designation:{ read: 'all',  write: 'all',  delete: 'none', approve: 'none' }
  },
  MANAGER: {
    employee:   { read: 'team', write: 'none', delete: 'none', approve: 'none' },
    leave:      { read: 'team', write: 'none', delete: 'none', approve: 'team' },
    attendance: { read: 'team', write: 'none', delete: 'none', approve: 'none' },
    payroll:    { read: 'none', write: 'none', delete: 'none', approve: 'none' },
    department: { read: 'all',  write: 'none', delete: 'none', approve: 'none' },
    designation:{ read: 'all',  write: 'none', delete: 'none', approve: 'none' }
  },
  EMPLOYEE: {
    employee:   { read: 'self', write: 'self', delete: 'none', approve: 'none' },
    leave:      { read: 'self', write: 'self', delete: 'none', approve: 'none' },
    attendance: { read: 'self', write: 'self', delete: 'none', approve: 'none' },
    payroll:    { read: 'self', write: 'none', delete: 'none', approve: 'none' },
    department: { read: 'all',  write: 'none', delete: 'none', approve: 'none' },
    designation:{ read: 'all',  write: 'none', delete: 'none', approve: 'none' }
  }
};
