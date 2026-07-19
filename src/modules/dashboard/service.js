import { getContext } from '../../utils/context.utils.js';

class DashboardService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  // ─── Admin / HR dashboard ─────────────────────────────────────────────────

  async getAdminDashboard() {
    const today     = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay   = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const { tenantId } = getContext();

    const [
      totalEmployees,
      presentToday,
      pendingLeaves,
      deptGroups,
      departments,
      recentLeaves,
      recentClockIns,
      tenant,
    ] = await Promise.all([
      // 1. Active employee count
      this.prisma.employee.count({ where: { isActive: true } }),

      // 2. Currently clocked in today (open session)
      this.prisma.attendance.count({
        where: { date: { gte: startOfDay, lt: endOfDay }, clockOut: null },
      }),

      // 3. Pending leave requests
      this.prisma.leave.count({ where: { status: 'PENDING' } }),

      // 4. Employee count grouped by departmentId
      this.prisma.employee.groupBy({
        by: ['departmentId'],
        where: { isActive: true },
        _count: { id: true },
      }),

      // 5. All departments — to resolve names for the breakdown
      this.prisma.department.findMany({ select: { id: true, name: true } }),

      // 6. Last 5 leave requests
      this.prisma.leave.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        },
      }),

      // 7. Last 5 clock-ins
      this.prisma.attendance.findMany({
        take: 5,
        orderBy: { clockIn: 'desc' },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        },
      }),

      // 8. Tenant subscription info — use findFirst (Prisma extension scopes by tenantId)
      this.prisma.tenant.findFirst({
        where: { id: tenantId },
        select: { subscriptionStatus: true, plan: true, trialEndsAt: true, planExpiresAt: true, maxEmployees: true },
      }),
    ]);

    // Resolve department names for groupBy results
    const deptMap = Object.fromEntries(departments.map((d) => [d.id, d.name]));
    const departmentBreakdown = deptGroups.map((g) => ({
      department: deptMap[g.departmentId] ?? 'Unassigned',
      count:      g._count.id,
    }));

    return {
      totalEmployees,
      presentToday,
      absentToday: totalEmployees - presentToday,
      pendingLeaves,
      departmentBreakdown,
      subscription: tenant ?? null,
      recentActivity: {
        leaves:   recentLeaves,
        clockIns: recentClockIns,
      },
    };
  }

  // ─── Manager dashboard ────────────────────────────────────────────────────

  async getManagerDashboard() {
    const { employeeId: managerId } = getContext();

    const today      = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay   = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    const [
      teamCount,
      teamOnLeaveToday,
      pendingTeamLeaves,
      teamAttendanceToday,
    ] = await Promise.all([
      // 1. Direct report count
      this.prisma.employee.count({ where: { managerId, isActive: true } }),

      // 2. Team members on approved leave today
      this.prisma.leave.count({
        where: {
          status:    'APPROVED',
          startDate: { lte: today },
          endDate:   { gte: today },
          employee:  { managerId },
        },
      }),

      // 3. Pending leave approvals for team
      this.prisma.leave.findMany({
        where: {
          status:   'PENDING',
          employee: { managerId },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        },
      }),

      // 4. Team attendance today
      this.prisma.attendance.findMany({
        where: {
          date:     { gte: startOfDay, lt: endOfDay },
          employee: { managerId },
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        },
      }),
    ]);

    return {
      teamCount,
      teamOnLeaveToday,
      pendingApprovals:    pendingTeamLeaves,
      teamAttendanceToday,
    };
  }

  // ─── Employee dashboard ───────────────────────────────────────────────────

  async getEmployeeDashboard() {
    const { employeeId } = getContext();

    const today      = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay   = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const year       = today.getFullYear();

    // Month range for hours-worked calculation
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      todaySession,
      leaveBalances,
      recentLeaves,
      monthSessions,
    ] = await Promise.all([
      // 1. Today's open attendance session
      this.prisma.attendance.findFirst({
        where: { employeeId, date: { gte: startOfDay, lt: endOfDay } },
        orderBy: { clockIn: 'desc' },
      }),

      // 2. Leave balances for current year
      this.prisma.leaveBalance.findMany({
        where: { employeeId, year },
        orderBy: { leaveType: 'asc' },
      }),

      // 3. Last 3 leave requests
      this.prisma.leave.findMany({
        where:   { employeeId },
        take:    3,
        orderBy: { createdAt: 'desc' },
      }),

      // 4. All completed sessions this month for hours calculation
      this.prisma.attendance.findMany({
        where: {
          employeeId,
          date:     { gte: startOfMonth, lt: endOfDay },
          clockOut: { not: null },
        },
      }),
    ]);

    // Calculate hours worked this month from completed sessions
    const totalMinutes = monthSessions.reduce((sum, s) => {
      return sum + Math.round((s.clockOut - s.clockIn) / 60000);
    }, 0);

    const balances = leaveBalances.map((b) => ({
      leaveType:   b.leaveType,
      totalDays:   b.totalDays,
      usedDays:    b.usedDays,
      pendingDays: b.pendingDays,
      remaining:   b.totalDays - b.usedDays - b.pendingDays,
    }));

    return {
      todaySession,
      leaveBalances:    balances,
      recentLeaves,
      hoursWorkedThisMonth: parseFloat((totalMinutes / 60).toFixed(2)),
    };
  }
}

export default DashboardService;
