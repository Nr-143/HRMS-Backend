import { NotFoundError, BadRequestError } from '../../utils/error.utils.js';
import { cache } from '../../utils/cache.utils.js';

class LeaveService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Submit a new leave application. Scoped automatically.
   */
  async requestLeave({ employeeId, startDate, endDate, type, reason }) {
    // 1. Validate employee presence (scoped to tenant automatically)
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId },
    });

    if (!employee) {
      throw new NotFoundError('Employee not found in this company context');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      throw new BadRequestError('Start date cannot fall after end date');
    }

    const leave = await this.prisma.leave.create({
      data: {
        employeeId,
        startDate: start,
        endDate: end,
        type,
        reason,
        status: 'PENDING',
      },
    });

    // Invalidate employee leave history cache
    await cache.del(`leaves:employee:${employeeId}`);

    return leave;
  }

  /**
   * Approve or reject a pending leave application. Scoped automatically.
   */
  async reviewLeave(leaveId, status) {
    // Validate record (scoped to tenant automatically)
    const leave = await this.prisma.leave.findFirst({
      where: { id: leaveId },
    });

    if (!leave) {
      throw new NotFoundError('Leave application record not found');
    }

    if (leave.status !== 'PENDING') {
      throw new BadRequestError(`Leave application has already been processed: ${leave.status}`);
    }

    const updatedLeave = await this.prisma.leave.update({
      where: { id: leaveId },
      data: { status },
    });

    // Invalidate cache
    await cache.del(`leaves:employee:${leave.employeeId}`);

    return updatedLeave;
  }

  /**
   * Retrieve leave history records for an employee. Scoped automatically.
   */
  async getEmployeeLeaves(employeeId) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId },
    });

    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    const cacheKey = `leaves:employee:${employeeId}`;
    
    // Check tenant-scoped cache
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const leaves = await this.prisma.leave.findMany({
      where: { employeeId },
      orderBy: { startDate: 'desc' },
    });

    await cache.set(cacheKey, leaves, 300); // 5 min TTL
    return leaves;
  }
}

export default LeaveService;
