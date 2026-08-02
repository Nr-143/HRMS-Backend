import { getContext } from '../../utils/context.utils.js';

class DashboardService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  METHOD 1: getAdminDashboard(requestingUser)
   * ════════════════════════════════════════════════════════════════════════ */
  async getAdminDashboard(requestingUser = {}) {
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const today = now;

    const role = requestingUser.role || 'ADMIN';

    const [
      totalEmployees,
      presentToday,
      onLeaveToday,
      pendingLeaves,
      pendingMyAction,
      departmentBreakdownRaw,
      recentLeaves,
      subscription
    ] = await Promise.all([
      // 1. Total active employees in tenant
      this.prisma.employee.count({ where: { isActive: true } }),

      // 2. Clocked in right now (clockOut is null, date is today)
      this.prisma.attendance.count({
        where: {
          date: { gte: startOfToday, lte: endOfToday },
          clockOut: null
        }
      }),

      // 3. On approved leave today
      this.prisma.leave.count({
        where: {
          status: 'APPROVED',
          startDate: { lte: today },
          endDate: { gte: today }
        }
      }),

      // 4. All pending leaves across company
      this.prisma.leave.count({
        where: { status: { in: ['PENDING', 'L1_APPROVED', 'L2_APPROVED'] } }
      }),

      // 5. Leaves pending THIS user's action specifically
      this.prisma.leave.count({
        where: {
          status: role === 'HR'
            ? 'L2_APPROVED'
            : { in: ['PENDING', 'L1_APPROVED', 'L2_APPROVED'] }
        }
      }),

      // 6. Department breakdown with HOD and employee count
      this.prisma.department.findMany({
        include: {
          hod: {
            select: {
              firstName: true,
              lastName: true,
              designation: { select: { name: true } }
            }
          },
          employees: {
            where: { isActive: true },
            select: { id: true }
          }
        }
      }),

      // 7. Recent 5 leave requests for activity feed
      this.prisma.leave.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        where: { status: { in: ['PENDING', 'L1_APPROVED', 'L2_APPROVED'] } },
        include: {
          employee: {
            select: {
              firstName: true,
              lastName: true,
              department: { select: { name: true } }
            }
          },
          approvalLogs: {
            orderBy: { actedAt: 'desc' },
            take: 1,
            include: { approver: { select: { firstName: true, lastName: true } } }
          }
        }
      }),

      // 8. Subscription info from tenant
      this.prisma.tenant.findFirst({
        select: {
          subscriptionStatus: true,
          plan: true,
          trialEndsAt: true,
          planExpiresAt: true,
          maxEmployees: true
        }
      })
    ]);

    const absentToday = Math.max(0, totalEmployees - presentToday - onLeaveToday);

    const formattedDepartmentBreakdown = departmentBreakdownRaw.map((d) => ({
      id: d.id,
      name: d.name,
      employeeCount: d.employees ? d.employees.length : 0,
      hod: d.hod ? `${d.hod.firstName} ${d.hod.lastName}` : null,
      hodDesignation: d.hod?.designation?.name || null
    }));

    const maxEmployees = subscription?.maxEmployees || 5;

    return {
      stats: {
        totalEmployees,
        presentToday,
        absentToday,
        onLeaveToday,
        pendingLeaves,
        pendingMyAction
      },
      departmentBreakdown: formattedDepartmentBreakdown,
      recentLeaves,
      subscription: subscription ? {
        ...subscription,
        employeeSlotsUsed: totalEmployees,
        employeeSlotsRemaining: maxEmployees - totalEmployees
      } : null
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  METHOD 2: getManagerDashboard(requestingUser)
   * ════════════════════════════════════════════════════════════════════════ */
  async getManagerDashboard(requestingUser = {}) {
    let managerId = requestingUser.employeeId || requestingUser.id;

    if (!managerId && requestingUser.sub) {
      const emp = await this.prisma.employee.findFirst({
        where: { userId: requestingUser.sub },
        select: { id: true }
      });
      if (emp) managerId = emp.id;
    }

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const today = now;

    // Build team scope — direct reports OR dept members if HOD
    const department = managerId
      ? await this.prisma.department.findFirst({ where: { hodId: managerId } })
      : null;
    const isDeptHOD = !!department;

    const teamScope = isDeptHOD
      ? { OR: [{ managerId }, { departmentId: department.id }] }
      : { managerId: managerId || '' };

    const [
      teamSize,
      presentToday,
      onLeaveToday,
      leavesNeedingAction,
      teamAttendanceToday
    ] = await Promise.all([
      // 1. Total team members
      this.prisma.employee.count({ where: { ...teamScope, isActive: true } }),

      // 2. Clocked in today
      this.prisma.attendance.count({
        where: {
          employee: teamScope,
          date: { gte: startOfToday, lte: endOfToday },
          clockOut: null
        }
      }),

      // 3. On approved leave today
      this.prisma.leave.count({
        where: {
          employee: teamScope,
          status: 'APPROVED',
          startDate: { lte: today },
          endDate: { gte: today }
        }
      }),

      // 4. Leaves PENDING manager's action at L1
      this.prisma.leave.findMany({
        where: {
          employee: { managerId: managerId || '' },
          status: 'PENDING',
          currentApprovalLevel: 0
        },
        include: {
          employee: {
            select: { firstName: true, lastName: true, designation: { select: { name: true } } }
          }
        },
        orderBy: { createdAt: 'asc' },
        take: 10
      }),

      // 5. Team members with their today's attendance status
      this.prisma.employee.findMany({
        where: { ...teamScope, isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          designation: { select: { name: true } },
          attendances: {
            where: { date: { gte: startOfToday, lte: endOfToday } },
            select: { clockIn: true, clockOut: true },
            take: 1
          },
          leaves: {
            where: {
              status: 'APPROVED',
              startDate: { lte: today },
              endDate: { gte: today }
            },
            select: { id: true },
            take: 1
          }
        }
      })
    ]);

    // Compute each team member's status
    const teamWithStatus = teamAttendanceToday.map((emp) => {
      const approvedLeaves = emp.leaves || [];
      const attendances = emp.attendances || [];
      const todayStatus = approvedLeaves.length > 0
        ? 'ON_LEAVE'
        : attendances.length > 0 && !attendances[0].clockOut
        ? 'PRESENT'
        : attendances.length > 0 && attendances[0].clockOut
        ? 'CLOCKED_OUT'
        : 'ABSENT';

      return {
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        designation: emp.designation,
        attendances: emp.attendances,
        leaves: emp.leaves,
        todayStatus
      };
    });

    const absentToday = Math.max(0, teamSize - presentToday - onLeaveToday);

    return {
      stats: {
        teamSize,
        presentToday,
        onLeaveToday,
        absentToday,
        leavesNeedingAction: leavesNeedingAction.length
      },
      teamLiveStatus: teamWithStatus,
      leavesNeedingAction,
      isHOD: isDeptHOD,
      department: isDeptHOD ? { id: department.id, name: department.name } : null
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  METHOD 3: getEmployeeDashboard(requestingUser)
   * ════════════════════════════════════════════════════════════════════════ */
  async getEmployeeDashboard(requestingUser = {}) {
    let employeeId = requestingUser.employeeId || requestingUser.id;

    if (!employeeId && requestingUser.sub) {
      const emp = await this.prisma.employee.findFirst({
        where: { userId: requestingUser.sub },
        select: { id: true }
      });
      if (emp) employeeId = emp.id;
    }

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const currentYear = now.getUTCFullYear();

    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));

    const [
      todayAttendance,
      monthSummary,
      leaveBalances,
      recentLeaves,
      profile
    ] = await Promise.all([
      // 1. Today's active session
      this.prisma.attendance.findFirst({
        where: {
          employeeId: employeeId || '',
          date: { gte: startOfToday, lte: endOfToday },
          clockOut: null
        },
        orderBy: { clockIn: 'desc' }
      }),

      // 2. This month's attendance count
      this.prisma.attendance.findMany({
        where: {
          employeeId: employeeId || '',
          date: { gte: startOfMonth, lte: endOfMonth }
        },
        select: { date: true, clockIn: true, clockOut: true }
      }),

      // 3. Leave balances for all types
      this.prisma.leaveBalance.findMany({
        where: { employeeId: employeeId || '', year: currentYear }
      }),

      // 4. Recent leave requests with approval chain
      this.prisma.leave.findMany({
        where: { employeeId: employeeId || '' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          approvalLogs: {
            orderBy: { actedAt: 'asc' },
            include: {
              approver: { select: { firstName: true, lastName: true } }
            }
          }
        }
      }),

      // 5. Own profile with manager + dept + designation
      this.prisma.employee.findFirst({
        where: { id: employeeId || '' },
        include: {
          user: { select: { email: true, role: true } },
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, name: true } },
          manager: {
            select: {
              firstName: true,
              lastName: true,
              designation: { select: { name: true } },
              department: { select: { name: true } }
            }
          }
        }
      })
    ]);

    // Calculate today's hours worked
    const hoursToday = todayAttendance
      ? Math.floor((Date.now() - new Date(todayAttendance.clockIn).getTime()) / 3600000)
      : 0;

    // Calculate distinct days present this month
    const distinctDaysPresent = new Set(
      monthSummary.map((a) => new Date(a.date).toISOString().slice(0, 10))
    ).size;

    // Calculate total hours worked this month
    const calculatedHours = monthSummary.reduce((total, a) => {
      if (a.clockIn && a.clockOut) {
        const hrs = (new Date(a.clockOut).getTime() - new Date(a.clockIn).getTime()) / 3600000;
        return total + Math.max(0, hrs);
      }
      return total;
    }, 0);

    // Calculate working days in month (excluding weekends Sat/Sun)
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    let workingDaysInMonth = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dayOfWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), d)).getUTCDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDaysInMonth++;
      }
    }

    const daysAbsent = Math.max(0, workingDaysInMonth - distinctDaysPresent);

    return {
      today: {
        isClockedIn: !!todayAttendance,
        clockInTime: todayAttendance?.clockIn || null,
        hoursWorked: hoursToday,
        sessionId: todayAttendance?.id || null
      },
      monthStats: {
        daysPresent: distinctDaysPresent,
        daysAbsent,
        totalHoursWorked: parseFloat(calculatedHours.toFixed(2))
      },
      leaveBalances,
      recentLeaves,
      profile
    };
  }
}

export default DashboardService;
