import { NotFoundError } from '../../utils/error.utils.js';
import { cache } from '../../utils/cache.utils.js';

class EmployeeService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Create an employee. TenantId is automatically injected by the Prisma Client Extension.
   */
  async createEmployee({ firstName, lastName, departmentId, designationId, employeeCode, dateOfJoining, phone, email }) {
    let userId = null;

    if (email) {
      // Automatically scoped to tenant under the hood
      const user = await this.prisma.user.findFirst({
        where: { email },
      });
      if (user) {
        userId = user.id;
      }
    }

    const employee = await this.prisma.employee.create({
      data: {
        firstName,
        lastName,
        employeeCode,
        dateOfJoining: new Date(dateOfJoining),
        phone,
        departmentId,
        designationId,
        userId,
      },
    });

    // Invalidate list cache
    await cache.del('employees:list');

    return employee;
  }

  /**
   * Update employee details. TenantId is automatically checked by the extension.
   */
  async updateEmployee(id, { firstName, lastName, departmentId, designationId, phone, isActive }, scopeFilter) {
    // Verify existence (scoped to tenant and user rbac scope)
    const employee = await this.prisma.employee.findFirst({
      where: { id, ...scopeFilter },
    });

    if (!employee) {
      throw new NotFoundError('Employee not found or you lack permission to modify this profile.');
    }

    const updatedEmployee = await this.prisma.employee.update({
      where: { id },
      data: {
        firstName,
        lastName,
        departmentId,
        designationId,
        phone,
        isActive,
      },
    });

    // Invalidate caches
    await cache.del('employees:list');
    await cache.del(`employee:${id}`);

    return updatedEmployee;
  }

  /**
   * Retrieve single employee. Scoped automatically by tenant and rbac scope filter.
   */
  async getEmployeeById(id, scopeFilter) {
    const cacheKey = `employee:${id}`;
    
    // Check tenant-scoped cache
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const employee = await this.prisma.employee.findFirst({
      where: { id, ...scopeFilter },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundError('Employee not found or access denied.');
    }

    await cache.set(cacheKey, employee, 600); // 10 min TTL
    return employee;
  }

  /**
   * Retrieve all employees. Scoped automatically by tenant and rbac scope filter.
   */
  async getAllEmployees(scopeFilter) {
    const cacheKey = 'employees:list';

    // Check tenant-scoped cache
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const employees = await this.prisma.employee.findMany({
      where: {
        ...scopeFilter
      },
      orderBy: { lastName: 'asc' },
    });

    await cache.set(cacheKey, employees, 300); // 5 min TTL
    return employees;
  }
}

export default EmployeeService;
