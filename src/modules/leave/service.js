import { NotFoundError, BadRequestError, ForbiddenError, ConflictError, ValidationError } from '../../utils/error.utils.js';
import { cache } from '../../utils/cache.utils.js';
import { getContext } from '../../utils/context.utils.js';
import { eventBus } from '../../utils/eventBus.utils.js';

const TERMINAL_STATES = new Set(['REJECTED', 'CANCELLED']);

class LeaveService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  // ─── Apply ────────────────────────────────────────────────────────────────

  async apply({ leaveType, startDate, endDate, reason }) {
    const { employeeId, tenantId } = getContext() || {};

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

    // Step 3: Overlap check — any PENDING, L1_APPROVED, L2_APPROVED, or APPROVED leave
    const overlap = await this.prisma.leave.findFirst({
      where: {
        employeeId,
        status: { in: ['PENDING', 'L1_APPROVED', 'L2_APPROVED', 'APPROVED'] },
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
    let balance = await this.prisma.leaveBalance.findFirst({
      where: { employeeId, leaveType, year },
    });

    if (!balance) {
      // Auto-seed balances from Tenant quotas if missing
      await this.getBalance(employeeId);
      balance = await this.prisma.leaveBalance.findFirst({
        where: { employeeId, leaveType, year },
      });
    }

    if (!balance && leaveType !== 'UNPAID') {
      throw new NotFoundError(`No leave balance found for type ${leaveType} in year ${year}`);
    }

    if (leaveType !== 'UNPAID' && balance && (balance.usedDays + balance.pendingDays + requestedDays > balance.totalDays)) {
      throw new ValidationError(
        `Insufficient leave balance. Available: ${balance.totalDays - balance.usedDays - balance.pendingDays} days`
      );
    }

    // Step 5: Calculate total approval levels based on manager & HOD availability
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId },
      include: { department: true },
    });

    const hasManager  = !!employee?.managerId;
    const hasHOD      = !!employee?.department?.hodId;
    const managerIsHOD = hasManager && hasHOD && employee.managerId === employee.department.hodId;

    let totalLevels;
    if (!hasManager && !hasHOD) totalLevels = 1;        // HR only
    else if (hasManager && !hasHOD) totalLevels = 2;    // Manager + HR
    else if (!hasManager && hasHOD) totalLevels = 2;    // HOD + HR
    else if (managerIsHOD) totalLevels = 2;             // HOD(=Manager) + HR
    else totalLevels = 3;                               // Manager + HOD + HR

    // Step 6: Atomic — create leave + increment pendingDays
    const leave = await this.prisma.$transaction(async (tx) => {
      const created = await tx.leave.create({
        data: {
          employeeId,
          tenantId,
          startDate: start,
          endDate:   end,
          type:      leaveType,
          reason:    reason ?? null,
          status:    'PENDING',
          requestedDays,
          currentApprovalLevel: 0,
          totalApprovalLevels:  totalLevels,
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

    eventBus.emit('leave.applied', leave);

    return leave;
  }

  // ─── Approve ──────────────────────────────────────────────────────────────

  async approve(leaveId, approverId, approverRole, comment) {
    const { tenantId } = getContext() || {};

    // 1. Fetch leave with employee + department + approvalLogs
    const leave = await this.prisma.leave.findFirst({
      where: { id: leaveId },
      include: {
        employee: { include: { department: { include: { hod: true } } } },
        approvalLogs: true,
      },
    });

    if (!leave) throw new NotFoundError('Leave request not found');

    if (TERMINAL_STATES.has(leave.status)) {
      throw new BadRequestError(`Cannot approve a ${leave.status.toLowerCase()} leave`);
    }
    if (leave.status === 'APPROVED') {
      throw new BadRequestError('Leave is already fully approved');
    }

    // 2. Check leave is in correct state for this approver
    let approverLevel;
    if (['ADMIN', 'OWNER_ADMIN', 'SUPER_ADMIN'].includes(approverRole)) {
      approverLevel = 'BYPASS'; // Admin can bypass all levels
    } else if (approverRole === 'HR') {
      // HR can only act when currentApprovalLevel === totalApprovalLevels - 1
      if (leave.currentApprovalLevel < leave.totalApprovalLevels - 1) {
        throw {
          status: 400,
          code: 'NOT_YOUR_TURN',
          message: 'Leave is still pending lower-level approval',
        };
      }
      approverLevel = leave.totalApprovalLevels;
    } else if (approverRole === 'MANAGER') {
      const isHOD     = leave.employee?.department?.hodId === approverId;
      const isManager = leave.employee?.managerId === approverId;

      if (!isHOD && !isManager) {
        throw {
          status: 403,
          code: 'NOT_YOUR_REPORT',
          message: 'This employee does not report to you',
        };
      }

      if (isHOD && leave.currentApprovalLevel >= 1) {
        approverLevel = 2;
      } else if (isManager && leave.currentApprovalLevel === 0) {
        approverLevel = 1;
      } else {
        throw {
          status: 400,
          code: 'NOT_YOUR_TURN',
          message: 'This approval level has already been completed or is not your turn',
        };
      }
    } else {
      throw new ForbiddenError('Unauthorized to approve leave requests');
    }

    const year    = leave.startDate.getFullYear();
    const balance = await this.prisma.leaveBalance.findFirst({
      where: { employeeId: leave.employeeId, leaveType: leave.type, year },
    });

    const isFinalApproval = approverLevel === 'BYPASS' || approverLevel === leave.totalApprovalLevels;

    let nextStatus = leave.status;
    let nextLevel  = leave.currentApprovalLevel;

    if (isFinalApproval) {
      nextStatus = 'APPROVED';
      nextLevel  = leave.totalApprovalLevels;
    } else if (approverLevel === 1) {
      nextStatus = 'L1_APPROVED';
      nextLevel  = 1;
    } else if (approverLevel === 2) {
      nextStatus = 'L2_APPROVED';
      nextLevel  = 2;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // a. Create LeaveApprovalLog entry
      await tx.leaveApprovalLog.create({
        data: {
          leaveId:      leave.id,
          approverId,
          approverRole,
          level:        approverLevel === 'BYPASS' ? leave.totalApprovalLevels : approverLevel,
          action:       approverLevel === 'BYPASS' ? 'BYPASSED' : 'APPROVED',
          comment:      comment ?? null,
          tenantId:     leave.tenantId || tenantId,
        },
      });

      // b. Update Leave
      const result = await tx.leave.update({
        where: { id: leaveId },
        data: {
          status:               nextStatus,
          currentApprovalLevel: nextLevel,
          approverId,
          approvedAt:           isFinalApproval ? new Date() : null,
        },
        include: {
          approvalLogs: true,
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        },
      });

      // c. Update LeaveBalance on final approval
      if (isFinalApproval && balance) {
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

    if (updated.status === 'APPROVED') {
      eventBus.emit('leave.approved', updated);
    } else {
      eventBus.emit('leave.level_approved', updated);
    }

    return updated;
  }

  // ─── Reject ───────────────────────────────────────────────────────────────

  async reject(leaveId, approverId, approverRole, comment) {
    const { tenantId } = getContext() || {};

    const leave = await this.prisma.leave.findFirst({
      where: { id: leaveId },
      include: {
        employee: { include: { department: { include: { hod: true } } } },
        approvalLogs: true,
      },
    });

    if (!leave) throw new NotFoundError('Leave request not found');

    if (TERMINAL_STATES.has(leave.status) || leave.status === 'APPROVED') {
      throw new BadRequestError(`Cannot reject a ${leave.status.toLowerCase()} leave`);
    }

    // Access check — verify approver can act on this leave
    if (['ADMIN', 'OWNER_ADMIN', 'SUPER_ADMIN', 'HR'].includes(approverRole)) {
      // HR / Admin can reject at any level
    } else if (approverRole === 'MANAGER') {
      const isHOD     = leave.employee?.department?.hodId === approverId;
      const isManager = leave.employee?.managerId === approverId;
      if (!isHOD && !isManager) {
        throw {
          status: 403,
          code: 'NOT_YOUR_REPORT',
          message: 'This employee does not report to you',
        };
      }
    } else {
      throw new ForbiddenError('Unauthorized to reject leave requests');
    }

    const year    = leave.startDate.getFullYear();
    const balance = await this.prisma.leaveBalance.findFirst({
      where: { employeeId: leave.employeeId, leaveType: leave.type, year },
    });

    const activeLevel = leave.currentApprovalLevel + 1;

    const updated = await this.prisma.$transaction(async (tx) => {
      // a. Create LeaveApprovalLog entry
      await tx.leaveApprovalLog.create({
        data: {
          leaveId:      leave.id,
          approverId,
          approverRole,
          level:        activeLevel,
          action:       'REJECTED',
          comment:      comment ?? null,
          tenantId:     leave.tenantId || tenantId,
        },
      });

      // b. Update leave status to REJECTED
      const result = await tx.leave.update({
        where: { id: leaveId },
        data: {
          status:          'REJECTED',
          rejectionReason: comment ?? null,
          approverId,
        },
        include: {
          approvalLogs: true,
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        },
      });

      // c. Release pendingDays from LeaveBalance
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

    eventBus.emit('leave.rejected', updated);

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

    eventBus.emit('leave.cancelled', updated);

    return updated;
  }

  // ─── List leaves ──────────────────────────────────────────────────────────

  async getLeaves(scopeFilter) {
    const { tenantId } = getContext() || {};
    return await this.prisma.leave.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        ...scopeFilter,
      },
      orderBy: { startDate: 'desc' },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        approver: { select: { id: true, firstName: true, lastName: true } },
        approvalLogs: { orderBy: { actedAt: 'asc' } },
      },
    });
  }

  // ─── Single leave ─────────────────────────────────────────────────────────

  async getLeaveById(leaveId, scopeFilter) {
    const { tenantId } = getContext() || {};
    const leave = await this.prisma.leave.findFirst({
      where: {
        id: leaveId,
        ...(tenantId ? { tenantId } : {}),
        ...scopeFilter,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        approver: { select: { id: true, firstName: true, lastName: true } },
        approvalLogs: { orderBy: { actedAt: 'asc' } },
      },
    });
    if (!leave) throw new NotFoundError('Leave request not found or access denied');
    return leave;
  }

  // ─── Leaves Pending My Action ──────────────────────────────────────────────

  async getLeavesPendingMyAction() {
    const { employeeId, role, tenantId } = getContext() || {};

    if (!employeeId && !['ADMIN', 'OWNER_ADMIN', 'SUPER_ADMIN', 'HR'].includes(role)) {
      return [];
    }

    const leaves = await this.prisma.leave.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: { in: ['PENDING', 'L1_APPROVED', 'L2_APPROVED'] },
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            managerId: true,
            departmentId: true,
            department: { select: { id: true, name: true, hodId: true } },
          },
        },
        approvalLogs: { orderBy: { actedAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const pendingForMe = leaves.filter((leave) => {
      const isManager = leave.employee?.managerId === employeeId;
      const isHOD     = leave.employee?.department?.hodId === employeeId;
      const isHR      = role === 'HR';
      const isAdmin   = ['ADMIN', 'OWNER_ADMIN', 'SUPER_ADMIN'].includes(role);

      if (isAdmin) return true; // Admins can bypass/act on any pending leave

      // Level 0 (PENDING): Direct Manager if exists; else HOD if exists; else HR
      if (leave.currentApprovalLevel === 0) {
        if (leave.employee?.managerId) {
          return isManager;
        } else if (leave.employee?.department?.hodId) {
          return isHOD;
        } else {
          return isHR;
        }
      }

      // Level 1 (L1_APPROVED): HOD (if assigned & distinct from manager); else HR
      if (leave.currentApprovalLevel === 1) {
        if (
          leave.employee?.department?.hodId &&
          leave.employee.department.hodId !== leave.employee.managerId
        ) {
          return isHOD;
        } else {
          return isHR;
        }
      }

      // Level 2 (L2_APPROVED): HR / Admin
      if (leave.currentApprovalLevel === 2) {
        return isHR || isAdmin;
      }

      return false;
    });

    return pendingForMe;
  }

  // ─── Balance ──────────────────────────────────────────────────────────────

  async getBalance(employeeId) {
    const { tenantId } = getContext() || {};
    const year = new Date().getFullYear();

    if (employeeId) {
      const cacheKey = `leave:balance:${employeeId}`;
      const cached = await cache.get(cacheKey, tenantId);
      if (cached) return cached;

      let balances = await this.prisma.leaveBalance.findMany({
        where: { employeeId, year },
        orderBy: { leaveType: 'asc' },
      });

      // Auto-seed missing employee leave balances from Tenant quotas
      if (!balances || balances.length === 0) {
        const employee = await this.prisma.employee.findUnique({
          where: { id: employeeId },
          include: { tenant: true },
        });

        if (employee) {
          const tenant = employee.tenant;
          const seedData = [
            { leaveType: 'CASUAL', totalDays: tenant?.casualLeaveQuota ?? 12 },
            { leaveType: 'SICK',   totalDays: tenant?.sickLeaveQuota ?? 10 },
            { leaveType: 'EARNED', totalDays: tenant?.earnedLeaveQuota ?? 15 },
            { leaveType: 'UNPAID', totalDays: 0 },
          ];

          await this.prisma.$transaction(
            seedData.map((s) =>
              this.prisma.leaveBalance.create({
                data: {
                  employeeId,
                  tenantId: employee.tenantId,
                  leaveType: s.leaveType,
                  year,
                  totalDays: s.totalDays,
                  usedDays: 0,
                  pendingDays: 0,
                },
              })
            )
          );

          balances = await this.prisma.leaveBalance.findMany({
            where: { employeeId, year },
            orderBy: { leaveType: 'asc' },
          });
        }
      }

      if (balances && balances.length > 0) {
        const result = balances.map((b) => ({
          leaveType:   b.leaveType,
          totalDays:   b.totalDays,
          usedDays:    b.usedDays,
          pendingDays: b.pendingDays,
          remaining:   b.totalDays - b.usedDays - b.pendingDays,
          year:        b.year,
        }));

        await cache.set(cacheKey, result, 300, tenantId);
        return result;
      }
    }

    // Fallback if user has no employee profile yet: pull from Tenant settings
    const tenant = tenantId
      ? await this.prisma.tenant.findUnique({ where: { id: tenantId } })
      : null;

    return [
      { leaveType: 'CASUAL', totalDays: tenant?.casualLeaveQuota ?? 12, usedDays: 0, pendingDays: 0, remaining: tenant?.casualLeaveQuota ?? 12, year },
      { leaveType: 'SICK',   totalDays: tenant?.sickLeaveQuota ?? 10,   usedDays: 0, pendingDays: 0, remaining: tenant?.sickLeaveQuota ?? 10,   year },
      { leaveType: 'EARNED', totalDays: tenant?.earnedLeaveQuota ?? 15, usedDays: 0, pendingDays: 0, remaining: tenant?.earnedLeaveQuota ?? 15, year },
      { leaveType: 'UNPAID', totalDays: 0,                             usedDays: 0, pendingDays: 0, remaining: 0,                             year },
    ];
  }
}

export default LeaveService;
