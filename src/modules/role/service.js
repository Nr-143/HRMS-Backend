import { abilities } from '../../rbac/abilities.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/error.utils.js';
import { cache } from '../../utils/cache.utils.js';
import eventBus from '../../utils/eventBus.utils.js';

export const ROLE_METADATA = {
  SUPER_ADMIN: {
    key: 'SUPER_ADMIN',
    name: 'Super Admin',
    description: 'System-wide platform administrator with unrestricted access.',
    level: 1,
  },
  OWNER_ADMIN: {
    key: 'OWNER_ADMIN',
    name: 'Owner Admin',
    description: 'Full workspace administrative & billing authority.',
    level: 2,
  },
  ADMIN: {
    key: 'ADMIN',
    name: 'Admin',
    description: 'Complete HRMS management across all operational modules.',
    level: 3,
  },
  HR: {
    key: 'HR',
    name: 'HR Manager',
    description: 'People operations, employee lifecycle, leaves, & departments.',
    level: 4,
  },
  MANAGER: {
    key: 'MANAGER',
    name: 'Team Manager',
    description: 'Direct report management, team attendance, & leave approvals.',
    level: 5,
  },
  EMPLOYEE: {
    key: 'EMPLOYEE',
    name: 'Employee',
    description: 'Self-service portal for attendance, clock in/out, & leave requests.',
    level: 6,
  },
};

class RoleService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /**
   * Returns system roles along with tenant user count per role.
   */
  async getRoles(tenantId) {
    // Count users per role in tenant
    const roleCounts = await this.prisma.user.groupBy({
      by: ['role'],
      where: { tenantId },
      _count: { role: true },
    });

    const countMap = {};
    roleCounts.forEach((rc) => {
      countMap[rc.role] = rc._count.role;
    });

    const rolesList = Object.keys(ROLE_METADATA).map((roleKey) => ({
      ...ROLE_METADATA[roleKey],
      userCount: countMap[roleKey] || 0,
      abilities: abilities[roleKey] || {},
    }));

    return rolesList;
  }

  /**
   * Returns system permissions matrix.
   */
  getPermissions() {
    return {
      abilities,
      modules: ['employee', 'leave', 'attendance', 'payroll', 'department', 'designation'],
      actions: ['read', 'write', 'delete', 'approve'],
      scopeLevels: ['all', 'team', 'self', 'none'],
    };
  }

  /**
   * Updates user role with tenant isolation, owner protection, and session revocation.
   */
  async updateUserRole({ userId, newRole, updatedById, tenantId }) {
    // Find target user inside tenant context
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User not found in active workspace');
    }

    // Owner protection safeguard
    if (user.isOwner && newRole !== 'OWNER_ADMIN') {
      throw new ForbiddenError('Primary tenant owner role cannot be downgraded from OWNER_ADMIN');
    }

    const previousRole = user.role;

    if (previousRole === newRole) {
      return { user, message: 'Role is already assigned' };
    }

    // Update user role in database
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { role: newRole },
      select: {
        id: true,
        email: true,
        role: true,
        isOwner: true,
        isActive: true,
        tenantId: true,
        updatedAt: true,
      },
    });

    // Invalidate user's cached Redis session so new role takes effect on next request
    await cache.del(`sess:${user.id}`, tenantId);

    // Audit Logging via EventBus
    eventBus.emit('user.roleChanged', {
      userId: user.id,
      email: user.email,
      previousRole,
      newRole,
      changedById: updatedById,
      tenantId,
      timestamp: new Date(),
    });

    return {
      user: updatedUser,
      employee: user.employee,
      previousRole,
      newRole,
    };
  }
}

export default RoleService;
