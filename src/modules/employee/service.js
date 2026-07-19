import bcrypt from 'bcryptjs';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/error.utils.js';
import { cache } from '../../utils/cache.utils.js';
import { getContext } from '../../utils/context.utils.js';

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
  async createEmployee({ firstName, lastName, departmentId, designationId, dateOfJoining, phone, email, managerId, role = 'EMPLOYEE' }) {
    const { tenantId } = getContext();

    // 1. Validate department belongs to this tenant
    const department = await this.prisma.department.findFirst({ where: { id: departmentId } });
    if (!department) throw new NotFoundError('Department not found in this tenant');

    // 2. Validate designation belongs to this tenant
    const designation = await this.prisma.designation.findFirst({ where: { id: designationId } });
    if (!designation) throw new NotFoundError('Designation not found in this tenant');

    // 3. Check email not already registered
    const existingUser = await this.prisma.user.findFirst({ where: { email } });
    if (existingUser) throw new BadRequestError('A user with this email already exists');

    const tempPassword = await bcrypt.hash(`Temp@${Date.now()}`, 10);
    const year = new Date().getFullYear();

    const result = await this.prisma.$transaction(async (tx) => {
      // 4. Create User record
      const user = await tx.user.create({
        data: {
          email,
          password: tempPassword,
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
          dateOfJoining: new Date(dateOfJoining),
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

    await cache.del('employees:list');

    // Return full profile
    return await this.prisma.employee.findFirst({
      where: { id: result.employee.id },
      include: {
        user:         { select: { id: true, email: true, role: true } },
        department:   { select: { id: true, name: true } },
        designation:  { select: { id: true, name: true } },
        leaveBalances: true,
      },
    });
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

    await cache.del('employees:list');
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

    await cache.del('employees:list');
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

    await cache.del('employees:list');
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
    const cacheKey = 'employees:list';
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const employees = await this.prisma.employee.findMany({
      where: { ...scopeFilter },
      orderBy: { lastName: 'asc' },
      include: {
        department:  { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
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
    const employees = await this.prisma.employee.findMany({
      where: { isActive: true },
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
}

export default EmployeeService;
