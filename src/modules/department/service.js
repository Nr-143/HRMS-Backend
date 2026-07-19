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
    return await this.prisma.department.findMany({ orderBy: { name: 'asc' } });
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
}

export default DepartmentService;
