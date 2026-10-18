import bcrypt from 'bcryptjs';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/error.utils.js';
import { cache } from '../../utils/cache.utils.js';
import { getContext } from '../../utils/context.utils.js';
import eventBus from '../../utils/eventBus.utils.js';

const LEAVE_BALANCE_SEEDS = [
  { leaveType: 'CASUAL', totalDays: 12 },
  { leaveType: 'SICK',   totalDays: 6  },
  { leaveType: 'EARNED', totalDays: 15 },
  { leaveType: 'UNPAID', totalDays: 0  },
];

/**
 * Extract initials from tenant/company name.
 * Takes first letter of each word, max 3 letters, uppercase.
 * 'Acme Corporation' → 'AC', 'Tech Corp India' → 'TCI', 'Startup' → 'ST'
 */
function extractInitials(name) {
  const words = name.trim().split(/\s+/);
  const letters = words.map((w) => w[0]).filter(Boolean).join('').toUpperCase();
  const initials = letters.substring(0, 3);
  return initials.padEnd(2, 'X'); // minimum 2 chars
}

class EmployeeService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Onboard a new employee.
   * Creates User + Employee + seeds LeaveBalance rows atomically.
   */
  async createEmployee(data) {
    const { tenantId } = getContext();
    let {
      firstName,
      lastName,
      name,
      departmentId,
      department: deptInput,
      designationId,
      designation: desigInput,
      dateOfJoining,
      joinDate,
      phone,
      email,
      managerId,
      role = 'EMPLOYEE',
    } = data;

    // 1. Resolve Name
    if (!firstName && name) {
      const parts = name.trim().split(/\s+/);
      firstName = parts[0] || 'Employee';
      lastName = parts.slice(1).join(' ') || '';
    }
    if (!firstName) firstName = 'Employee';
    if (!lastName) lastName = '';
    // Prevent duplicating first name if client sent identical values or single-word name
    if (lastName && firstName.trim().toLowerCase() === lastName.trim().toLowerCase()) {
      lastName = '';
    }

    // 2. Resolve Date of Joining
    const joiningDateStr = dateOfJoining || joinDate || new Date().toISOString();
    const parsedJoiningDate = new Date(joiningDateStr);

    // 3. Resolve Department
    let deptRecord = null;
    if (departmentId) {
      deptRecord = await this.prisma.department.findFirst({ where: { id: departmentId } });
    }
    if (!deptRecord && deptInput) {
      deptRecord = await this.prisma.department.findFirst({
        where: { OR: [{ id: deptInput }, { name: deptInput }] },
      });
      if (!deptRecord) {
        deptRecord = await this.prisma.department.create({
          data: { name: deptInput, tenantId },
        });
      }
    }
    if (!deptRecord) {
      deptRecord = await this.prisma.department.findFirst({ where: { tenantId } });
      if (!deptRecord) {
        deptRecord = await this.prisma.department.create({
          data: { name: 'General', tenantId },
        });
      }
    }
    departmentId = deptRecord.id;

    // 4. Resolve Designation
    let desigRecord = null;
    if (designationId) {
      desigRecord = await this.prisma.designation.findFirst({ where: { id: designationId } });
    }
    if (!desigRecord && desigInput) {
      desigRecord = await this.prisma.designation.findFirst({
        where: { OR: [{ id: desigInput }, { name: desigInput }] },
      });
      if (!desigRecord) {
        desigRecord = await this.prisma.designation.create({
          data: { name: desigInput, tenantId },
        });
      }
    }
    if (!desigRecord) {
      desigRecord = await this.prisma.designation.findFirst({ where: { tenantId } });
      if (!desigRecord) {
        desigRecord = await this.prisma.designation.create({
          data: { name: 'Staff', tenantId },
        });
      }
    }
    designationId = desigRecord.id;

    // 5. Check email not already registered
    const existingUser = await this.prisma.user.findFirst({ where: { email } });
    if (existingUser) throw new BadRequestError('A user with this email already exists');

    // Generate a readable temp password and keep the plain-text to return to admin
    const plainPassword = `Emp@${Math.floor(1000 + Math.random() * 9000)}`;
    const hashedPassword = await bcrypt.hash(plainPassword, 10);
    const year = new Date().getFullYear();

    const result = await this.prisma.$transaction(async (tx) => {
      // 4. Create User record
      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          role,
          isOwner: false,
          isActive: true,
          tenantId,
        },
      });

      // 5. Generate employee code — count inside transaction (race-condition safe)
      const tenant = await tx.tenant.findFirst({ where: { id: tenantId } });
      const initials = extractInitials(tenant.name);
      const count = await tx.employee.count({ where: { tenantId } });
      const employeeCode = `EMP-${initials}-${String(count + 1).padStart(4, '0')}`;

      // 6. Create Employee record
      const employee = await tx.employee.create({
        data: {
          firstName,
          lastName,
          employeeCode,
          dateOfJoining: parsedJoiningDate,
          phone: phone || null,
          departmentId,
          designationId,
          managerId: managerId || null,
          userId: user.id,
          tenantId,
          isActive: true,
        },
      });

      // 7. Seed LeaveBalance rows for current year
      await tx.leaveBalance.createMany({
        data: LEAVE_BALANCE_SEEDS.map((seed) => ({
          employeeId: employee.id,
          tenantId,
          leaveType: seed.leaveType,
          totalDays: seed.totalDays,
          usedDays: 0,
          pendingDays: 0,
          year,
        })),
      });

      return { employee, user };
    });

    await cache.delByPrefix('employees:list');

    // Return full profile + plain password (shown once to admin)
    const fullEmployee = await this.prisma.employee.findFirst({
      where: { id: result.employee.id },
      include: {
        user:         { select: { id: true, email: true, role: true } },
        department:   { select: { id: true, name: true } },
        designation:  { select: { id: true, name: true } },
        leaveBalances: true,
      },
    });

    return { ...fullEmployee, tempPassword: plainPassword };
  }

  /**
   * Partial update of employee profile fields.
   */
  async updateEmployee(id, data, scopeFilter) {
    const employee = await this.prisma.employee.findFirst({ where: { id, ...scopeFilter } });
    if (!employee) throw new NotFoundError('Employee not found or access denied');

    const { firstName, lastName, phone, departmentId, designationId, managerId } = data;

    // Validate dept/desig if being changed
    if (departmentId) {
      const dept = await this.prisma.department.findFirst({ where: { id: departmentId } });
      if (!dept) throw new NotFoundError('Department not found in this tenant');
    }
    if (designationId) {
      const desig = await this.prisma.designation.findFirst({ where: { id: designationId } });
      if (!desig) throw new NotFoundError('Designation not found in this tenant');
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        ...(firstName    !== undefined && { firstName }),
        ...(lastName     !== undefined && { lastName }),
        ...(phone        !== undefined && { phone }),
        ...(departmentId !== undefined && { departmentId }),
        ...(designationId!== undefined && { designationId }),
        ...(managerId    !== undefined && { managerId }),
      },
      include: {
        department:  { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
      },
    });

    await cache.delByPrefix('employees:list');
    await cache.del(`employee:${id}`);
    return updated;
  }

  /**
   * Soft delete — sets isActive: false. Guards against deleting the tenant owner.
   */
  async deleteEmployee(id) {
    const employee = await this.prisma.employee.findFirst({
      where: { id },
      include: { user: { select: { isOwner: true } } },
    });

    if (!employee) throw new NotFoundError('Employee not found');
    if (employee.user?.isOwner) {
      throw new ForbiddenError('Cannot deactivate the account owner');
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data: { isActive: false },
    });

    await cache.delByPrefix('employees:list');
    await cache.del(`employee:${id}`);
    return updated;
  }

  /**
   * Reactivate a previously deactivated employee.
   */
  async reactivateEmployee(id) {
    const employee = await this.prisma.employee.findFirst({ where: { id } });
    if (!employee) throw new NotFoundError('Employee not found');
    if (employee.isActive) throw new BadRequestError('Employee is already active');

    const updated = await this.prisma.employee.update({
      where: { id },
      data: { isActive: true },
    });

    await cache.delByPrefix('employees:list');
    await cache.del(`employee:${id}`);
    return updated;
  }

  /**
   * Get single employee by id, scoped by RBAC filter.
   */
  async getEmployeeById(id, scopeFilter) {
    const cacheKey = `employee:${id}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const employee = await this.prisma.employee.findFirst({
      where: { id, ...scopeFilter },
      include: {
        user:        { select: { id: true, email: true, role: true } },
        department:  { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
        manager:     { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
    });

    if (!employee) throw new NotFoundError('Employee not found or access denied');

    await cache.set(cacheKey, employee, 600);
    return employee;
  }

  /**
   * List all employees, scoped by RBAC filter.
   */
  async getAllEmployees(scopeFilter) {
    const { tenantId, userId, role } = getContext() || {};
    const scopeStr = JSON.stringify(scopeFilter || {});
    const cacheKey = `employees:list:${role || 'ALL'}:${userId || 'ALL'}:${scopeStr}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const employees = await this.prisma.employee.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...scopeFilter,
      },
      orderBy: { lastName: 'asc' },
      include: {
        user:        { select: { id: true, email: true, role: true } },
        department:  { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
        manager:     { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
    });

    await cache.set(cacheKey, employees, 300);
    return employees;
  }

  /**
   * Build org chart tree from flat employee list (Option A — in-memory, up to ~500 employees).
   * Each node: { id, firstName, lastName, employeeCode, designation, department, children }
   */
  async getOrgChart() {
    const { tenantId } = getContext() || {};
    const employees = await this.prisma.employee.findMany({
      where: {
        isActive: true,
        ...(tenantId ? { tenantId } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        managerId: true,
        department:  { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
      },
    });

    const nodeMap = {};
    employees.forEach((emp) => {
      nodeMap[emp.id] = { ...emp, children: [] };
    });

    const roots = [];
    employees.forEach((emp) => {
      if (emp.managerId && nodeMap[emp.managerId]) {
        nodeMap[emp.managerId].children.push(nodeMap[emp.id]);
      } else {
        roots.push(nodeMap[emp.id]);
      }
    });

    return roots;
  }

  /**
   * Dedicated Reporting Manager Update.
   * Includes circular reporting chain check, level-0 pending leave reassignment logging, and history audit trail.
   */
  async updateReportingManager(employeeId, newManagerId, changedById, reason) {
    const { tenantId } = getContext() || {};

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, ...(tenantId ? { tenantId } : {}) },
      include: { user: true },
    });

    if (!employee) throw new NotFoundError('Employee not found');
    if (!employee.isActive) throw new BadRequestError('Employee is inactive');
    if (employee.user?.isOwner) {
      throw new ForbiddenError('Cannot change reporting manager of the account owner');
    }

    if (newManagerId) {
      const newManager = await this.prisma.employee.findFirst({
        where: { id: newManagerId, ...(tenantId ? { tenantId } : {}) },
      });
      if (!newManager) throw new NotFoundError('New reporting manager not found');
      if (!newManager.isActive) throw new BadRequestError('Selected manager is inactive');

      if (newManagerId === employeeId) {
        throw new BadRequestError('Employee cannot report to themselves');
      }

      // Circular reporting chain check (while loop up the manager chain)
      let currId = newManagerId;
      const visited = new Set();
      while (currId) {
        if (currId === employeeId) {
          throw new BadRequestError('This creates a circular reporting chain');
        }
        if (visited.has(currId)) break;
        visited.add(currId);
        const parent = await this.prisma.employee.findFirst({
          where: { id: currId },
          select: { managerId: true },
        });
        currId = parent?.managerId || null;
      }
    }

    const oldManagerId = employee.managerId;

    const { updatedEmployee, pendingLeaves, historyEntry } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({
        where: { id: employeeId },
        data: { managerId: newManagerId || null },
        include: {
          manager: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, name: true } },
        },
      });

      const pending = await tx.leave.findMany({
        where: {
          employeeId,
          status: 'PENDING',
          currentApprovalLevel: 0,
        },
      });

      for (const leave of pending) {
        await tx.leaveApprovalLog.create({
          data: {
            leaveId: leave.id,
            approverId: changedById,
            approverRole: 'ADMIN',
            level: 0,
            action: 'REASSIGNED',
            comment: 'Reassigned to new manager due to reporting change',
            tenantId: tenantId || employee.tenantId,
          },
        });
      }

      const history = await tx.employeeReportingHistory.create({
        data: {
          employeeId,
          oldManagerId,
          newManagerId: newManagerId || null,
          changedById,
          reason: reason || null,
          reassignedLeaveCount: pending.length,
          tenantId: tenantId || employee.tenantId,
        },
        include: {
          oldManager: { select: { firstName: true, lastName: true } },
          newManager: { select: { firstName: true, lastName: true } },
          changedBy: { select: { firstName: true, lastName: true } },
        },
      });

      return { updatedEmployee: updated, pendingLeaves: pending, historyEntry: history };
    });

    eventBus.emit('employee.managerChanged', {
      employeeId,
      oldManagerId,
      newManagerId,
      changedById,
      reassignedCount: pendingLeaves.length,
      tenantId: tenantId || employee.tenantId,
    });

    await cache.delByPrefix('employees:list');
    await cache.del(`employee:${employeeId}`);

    return {
      employee: updatedEmployee,
      reassignedLeaveCount: pendingLeaves.length,
      history: historyEntry,
    };
  }

  /**
   * Get employee reporting manager change history.
   */
  async getReportingHistory(employeeId) {
    const { tenantId } = getContext() || {};
    return this.prisma.employeeReportingHistory.findMany({
      where: {
        employeeId,
        ...(tenantId ? { tenantId } : {}),
      },
      include: {
        oldManager: { select: { firstName: true, lastName: true } },
        newManager: { select: { firstName: true, lastName: true } },
        changedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { changedAt: 'desc' },
    });
  }
}

export default EmployeeService;
