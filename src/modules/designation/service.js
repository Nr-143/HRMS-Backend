import { NotFoundError, ConflictError } from '../../utils/error.utils.js';

class DesignationService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  async create({ name }) {
    const existing = await this.prisma.designation.findFirst({ where: { name } });
    if (existing) throw new ConflictError('A designation with this name already exists');

    return await this.prisma.designation.create({ data: { name } });
  }

  async batchCreate(names) {
    let created = 0;
    let skipped = 0;

    for (const name of names) {
      const existing = await this.prisma.designation.findFirst({ where: { name } });
      if (existing) {
        skipped++;
      } else {
        await this.prisma.designation.create({ data: { name } });
        created++;
      }
    }

    return { created, skipped };
  }

  async findAll() {
    return await this.prisma.designation.findMany({ orderBy: { name: 'asc' } });
  }

  async update(id, { name }) {
    const designation = await this.prisma.designation.findFirst({ where: { id } });
    if (!designation) throw new NotFoundError('Designation not found');

    const duplicate = await this.prisma.designation.findFirst({ where: { name } });
    if (duplicate && duplicate.id !== id) {
      throw new ConflictError('A designation with this name already exists');
    }

    return await this.prisma.designation.update({ where: { id }, data: { name } });
  }

  async delete(id) {
    const designation = await this.prisma.designation.findFirst({ where: { id } });
    if (!designation) throw new NotFoundError('Designation not found');

    const assignedCount = await this.prisma.employee.count({ where: { designationId: id } });
    if (assignedCount > 0) {
      throw new ConflictError('Cannot delete — employees are assigned to this designation');
    }

    await this.prisma.designation.delete({ where: { id } });
    return null;
  }
}

export default DesignationService;
