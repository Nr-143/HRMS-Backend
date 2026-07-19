import { NotFoundError, BadRequestError, ForbiddenError, ConflictError, ValidationError } from '../../utils/error.utils.js';
import { cache } from '../../utils/cache.utils.js';
import { getContext } from '../../utils/context.utils.js';

const TERMINAL_STATES = new Set(['REJECTED', 'CANCELLED']);

class LeaveService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  // ─── Apply ────────────────────────────────────────────────────────────────

  async apply({ leaveType, startDate, endDate, reason }) {
    const { employeeId } = getContext();

    const start = new Date(startDate);
    const end   = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Step 1: Date validations
    if (start < today) {
      throw new ValidationError('Cannot apply for leave on past dates');
    }
    if (start > end) {
      throw new ValidationError('Start date cannot be after end date');
    }

    // Step 2: Requested days (inclusive)
    const requestedDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;

    // Step 3: Overlap check — any PENDING or APPROVED leave that overlaps
    const overlap = await this.prisma.leave.findFirst({
      where: {
        employeeId,
        status: { in: ['PENDING', 'APPROVED'] },
        AND: [
          { startDate: { lte: end   } },
          { endDate:   { gte: start } },
        ],
      },
    });
    if (overlap) {
      throw new ConflictError('Leave dates overlap with an existing pending or approved leave');
    }

    // Step 4: Balance check
    const year    = start.getFullYear();
    const balance = await this.prisma.leaveBalance.findFirst({
      where: { employeeId, leaveType, year },
    });

    if (!balance) {
      throw new NotFoundError(`No leave balance found for type ${leaveType} in year ${year}`);
    }

    if (balance.usedDays + balance.pendingDays + requestedDays > balance.totalDays) {
      throw new ValidationError(
        `Insufficient leave balance. Available: ${balance.totalDays - balance.usedDays - balance.pendingDays} days`
      );
    }

    // Step 5: Atomic — create leave + increment pendingDays
    const leave = await this.prisma.$transaction(async (tx) => {
      const created = await tx.leave.create({
        data: {
          employeeId,
          startDate: start,
          endDate:   end,
          type:      leaveType,
          reason:    reason ?? null,
          status:    'PENDING',
          requestedDays,
        },
      });

      await tx.leaveBalance.update({
        where: { id: balance.id },
        data:  { pendingDays: { increment: requestedDays } },
      });

      return created;
    });

    await cache.del(`leaves:employee:${employeeId}`);
    await cache.del(`leave:balance:${employeeId}`);

    return leave;
  }

  // ─── Approve ──────────────────────────────────────────────────────────────

  async approve(leaveId, approverId, approverRole) {
    const leave = await this.prisma.leave.findFirst({
      where: { id: leaveId },
      include: { employee: { select: { id: true, managerId: true } } },
    });

    if (!leave) throw new NotFoundError('Leave request not found');
    if (TERMINAL_STATES.has(leave.status)) {
      throw new BadRequestError(`Cannot approve a ${leave.status.toLowerCase()} leave`);
    }
    if (leave.status !== 'PENDING') {
      throw new BadRequestError(`Leave is already ${leave.status.toLowerCase()}`);
    }

    // MANAGER scope guard — must be direct report
    if (approverRole === 'MANAGER' && leave.employee.managerId !== approverId) {
      throw new ForbiddenError("You can only manage your direct reports' leaves");
    }

    const year    = leave.startDate.getFullYear();
    const balance = await this.prisma.leaveBalance.findFirst({
      where: { employeeId: leave.employeeId, leaveType: leave.type, year },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.leave.update({
        where: { id: leaveId },
        data: {
          status:     'APPROVED',
          approverId,
          approvedAt: new Date(),
        },
      });

      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: {
            usedDays:    { increment: leave.requestedDays },
            pendingDays: { decrement: leave.requestedDays },
          },
        });
      }

      return result;
    });

    await cache.del(`leaves:employee:${leave.employeeId}`);
    await cache.del(`leave:balance:${leave.employeeId}`);

    return updated;
  }

  // ─── Reject ───────────────────────────────────────────────────────────────

  async reject(leaveId, approverId, approverRole, rejectionReason) {
    const leave = await this.prisma.leave.findFirst({
      where: { id: leaveId },
      include: { employee: { select: { id: true, managerId: true } } },
    });

    if (!leave) throw new NotFoundError('Leave request not found');
    if (TERMINAL_STATES.has(leave.status)) {
      throw new BadRequestError(`Cannot reject a ${leave.status.toLowerCase()} leave`);
    }
    if (leave.status !== 'PENDING') {
      throw new BadRequestError(`Leave is already ${leave.status.toLowerCase()}`);
    }

    if (approverRole === 'MANAGER' && leave.employee.managerId !== approverId) {
      throw new ForbiddenError("You can only manage your direct reports' leaves");
    }

    const year    = leave.startDate.getFullYear();
    const balance = await this.prisma.leaveBalance.findFirst({
      where: { employeeId: leave.employeeId, leaveType: leave.type, year },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.leave.update({
        where: { id: leaveId },
        data: {
          status:          'REJECTED',
          rejectionReason: rejectionReason ?? null,
          approverId,
        },
      });

      if (balance) {
        await tx.leaveBalance.update({
          where: { id: balance.id },
          data: { pendingDays: { decrement: leave.requestedDays } },
        });
      }

      return result;
    });

    await cache.del(`leaves:employee:${leave.employeeId}`);
    await cache.del(`leave:balance:${leave.employeeId}`);

    return updated;
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────

  async cancel(leaveId, requestingEmployeeId, requestingRole) {
    const leave = await this.prisma.leave.findFirst({ where: { id: leaveId } });

    if (!leave) throw new NotFoundError('Leave request not found');
    if (TERMINAL_STATES.has(leave.status)) {
      throw new BadRequestError(`Leave is already ${leave.status.toLowerCase()}`);
    }

    const isEmployee = requestingRole === 'EMPLOYEE';
    const isOwner    = leave.employeeId === requestingEmployeeId;

    // EMPLOYEE can only cancel their own PENDING leaves
    if (isEmployee) {
      if (!isOwner) throw new ForbiddenError('You can only cancel your own leave requests');
      if (leave.status === 'APPROVED') {
        throw new ForbiddenError('Employees cannot cancel approved leaves. Contact HR or Admin.');
      }
    }

    const year    = leave.startDate.getFullYear();
    const balance = await this.prisma.leaveBalance.findFirst({
      where: { employeeId: leave.employeeId, leaveType: leave.type, year },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.leave.update({
        where: { id: leaveId },
        data:  { status: 'CANCELLED' },
      });

      if (balance) {
        // PENDING cancel → decrement pendingDays; APPROVED cancel → decrement usedDays
        const balanceUpdate = leave.status === 'APPROVED'
          ? { usedDays:    { decrement: leave.requestedDays } }
          : { pendingDays: { decrement: leave.requestedDays } };

        await tx.leaveBalance.update({
          where: { id: balance.id },
          data:  balanceUpdate,
        });
      }

      return result;
    });

    await cache.del(`leaves:employee:${leave.employeeId}`);
    await cache.del(`leave:balance:${leave.employeeId}`);

    return updated;
  }

  // ─── List leaves ──────────────────────────────────────────────────────────

  async getLeaves(scopeFilter) {
    return await this.prisma.leave.findMany({
      where: { ...scopeFilter },
      orderBy: { startDate: 'desc' },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        approver: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // ─── Single leave ─────────────────────────────────────────────────────────

  async getLeaveById(leaveId, scopeFilter) {
    const leave = await this.prisma.leave.findFirst({
      where: { id: leaveId, ...scopeFilter },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        approver: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!leave) throw new NotFoundError('Leave request not found or access denied');
    return leave;
  }

  // ─── Balance ──────────────────────────────────────────────────────────────

  async getBalance(employeeId) {
    const cacheKey = `leave:balance:${employeeId}`;
    const cached   = await cache.get(cacheKey);
    if (cached) return cached;

    const year     = new Date().getFullYear();
    const balances = await this.prisma.leaveBalance.findMany({
      where: { employeeId, year },
      orderBy: { leaveType: 'asc' },
    });

    const result = balances.map((b) => ({
      leaveType:   b.leaveType,
      totalDays:   b.totalDays,
      usedDays:    b.usedDays,
      pendingDays: b.pendingDays,
      remaining:   b.totalDays - b.usedDays - b.pendingDays,
      year:        b.year,
    }));

    await cache.set(cacheKey, result, 300);
    return result;
  }
}

export default LeaveService;
