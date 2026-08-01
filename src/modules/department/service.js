import { NotFoundError, ConflictError } from '../../utils/error.utils.js';

class DepartmentService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async create({ name }) {
    const existing = await this.prisma.department.findFirst({ where: { name } });
    if (existing) throw new ConflictError('A department with this name already exists');

    return await this.prisma.department.create({ data: { name } });
  }

  async batchCreate(names) {
    let created = 0;
    let skipped = 0;

    for (const name of names) {
      const existing = await this.prisma.department.findFirst({ where: { name } });
      if (existing) {
        skipped++;
      } else {
        await this.prisma.department.create({ data: { name } });
        created++;
      }
    }

    return { created, skipped };
  }

  async findAll() {
    const departments = await this.prisma.department.findMany({
      orderBy: { name: 'asc' },
      include: {
        employees: { where: { isActive: true }, select: { id: true } },
        hod: {
          include: {
            user: { select: { role: true } },
            designation: true,
          },
        },
      },
    });

    return departments.map((dept) => {
      const { employees, ...rest } = dept;
      return {
        ...rest,
        employeeCount: employees ? employees.length : 0,
      };
    });
  }

  async update(id, { name }) {
    const department = await this.prisma.department.findFirst({ where: { id } });
    if (!department) throw new NotFoundError('Department not found');

    const duplicate = await this.prisma.department.findFirst({ where: { name } });
    if (duplicate && duplicate.id !== id) {
      throw new ConflictError('A department with this name already exists');
    }

    return await this.prisma.department.update({ where: { id }, data: { name } });
  }

  async delete(id) {
    const department = await this.prisma.department.findFirst({ where: { id } });
    if (!department) throw new NotFoundError('Department not found');

    const assignedCount = await this.prisma.employee.count({ where: { departmentId: id } });
    if (assignedCount > 0) {
      throw new ConflictError('Cannot delete — employees are assigned to this department');
    }

    await this.prisma.department.delete({ where: { id } });
    return null;
  }

  /**
   * Assign an HOD to a Department.
   */
  async assignHOD(departmentId, employeeId) {
    // 1. Verify department exists
    const department = await this.prisma.department.findFirst({ where: { id: departmentId } });
    if (!department) throw new NotFoundError('Department not found');

    // 2. Verify employee exists
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId },
      include: { user: { select: { role: true } } },
    });
    if (!employee) throw new NotFoundError('Employee not found');

    // 3. Verify employee belongs to this department
    if (employee.departmentId !== departmentId) {
      throw {
        status: 400,
        code: 'EMPLOYEE_NOT_IN_DEPT',
        message: 'HOD must be an employee of this department',
      };
    }

    // 4. Verify employee has MANAGER role or above
    const allowedRoles = ['SUPER_ADMIN', 'OWNER_ADMIN', 'ADMIN', 'HR', 'MANAGER'];
    if (!employee.user || !allowedRoles.includes(employee.user.role)) {
      throw {
        status: 400,
        code: 'INVALID_HOD_ROLE',
        message: 'HOD must have Manager role or above',
      };
    }

    // 5. Update department with hodId
    const updated = await this.prisma.department.update({
      where: { id: departmentId },
      data: { hodId: employeeId },
      include: {
        hod: {
          include: {
            user: { select: { role: true } },
            designation: true,
          },
        },
      },
    });

    return updated;
  }

  /**
   * Remove HOD from a Department.
   */
  async removeHOD(departmentId) {
    const department = await this.prisma.department.findFirst({ where: { id: departmentId } });
    if (!department) throw new NotFoundError('Department not found');

    return await this.prisma.department.update({
      where: { id: departmentId },
      data: { hodId: null },
      include: {
        hod: true,
      },
    });
  }

  /**
   * Get employees in a department who have MANAGER role or above.
   * Used to populate manager dropdown when onboarding an employee.
   */
  async getManagersByDepartment(departmentId) {
    const department = await this.prisma.department.findFirst({ where: { id: departmentId } });
    if (!department) throw new NotFoundError('Department not found');

    return await this.prisma.employee.findMany({
      where: {
        departmentId,
        isActive: true,
        user: {
          role: {
            in: ['SUPER_ADMIN', 'OWNER_ADMIN', 'ADMIN', 'HR', 'MANAGER'],
          },
        },
      },
      include: {
        user: { select: { role: true } },
        designation: true,
      },
      orderBy: { firstName: 'asc' },
    });
  }
}

export default DepartmentService;
