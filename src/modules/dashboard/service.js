import { getContext } from '../../utils/context.utils.js';

class DashboardService {
  constructor(prisma) {
    this.prisma = prisma;
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  METHOD 1: getAdminDashboard(requestingUser)
   * ════════════════════════════════════════════════════════════════════════ */
  async getAdminDashboard(requestingUser = {}) {
    const userId = requestingUser.sub || requestingUser.id || requestingUser.userId;
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
      subscription,
      profile
    ] = await Promise.all([
      // 1. Total active employees in tenant
      this.prisma.employee.count({ where: { isActive: true } }),

      // 2. Clocked in right now (clockOut is null, date is today)
      this.prisma.attendance.count({
        where: {
          OR: [
            { date: { gte: startOfToday, lte: endOfToday } },
            { clockIn: { gte: startOfToday, lte: endOfToday } }
          ],
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
              employeeCode: true,
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
              employeeCode: true,
              department: { select: { name: true } }
            }
          },
          approvalLogs: {
            orderBy: { actedAt: 'desc' },
            take: 1,
            include: { approver: { select: { firstName: true, lastName: true, employeeCode: true } } }
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
      }),

      // 9. Admin profile with employeeCode
      this.prisma.employee.findFirst({
        where: {
          OR: [
            ...(requestingUser.employeeId ? [{ id: requestingUser.employeeId }] : []),
            ...(userId ? [{ userId }] : [])
          ]
        },
        select: { id: true, firstName: true, lastName: true, employeeCode: true }
      })
    ]);

    const yetToClockIn = Math.max(0, totalEmployees - presentToday - onLeaveToday);

    const formattedDepartmentBreakdown = departmentBreakdownRaw.map((d) => ({
      id: d.id,
      name: d.name,
      employeeCount: d.employees ? d.employees.length : 0,
      hod: d.hod ? `${d.hod.firstName} ${d.hod.lastName}` : null,
      hodEmployeeCode: d.hod?.employeeCode || null,
      hodDesignation: d.hod?.designation?.name || null
    }));

    const maxEmployees = subscription?.maxEmployees || 5;

    return {
      stats: {
        totalEmployees,
        presentToday,
        onLeaveToday,
        yetToClockIn,
        pendingLeaves,
        pendingMyAction
      },
      departmentBreakdown: formattedDepartmentBreakdown,
      recentLeaves,
      profile,
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
    const userId = requestingUser.sub || requestingUser.id || requestingUser.userId;
    let managerEmp = null;

    if (requestingUser.employeeId) {
      managerEmp = await this.prisma.employee.findFirst({
        where: { id: requestingUser.employeeId },
        select: { id: true, employeeCode: true, departmentId: true, firstName: true, lastName: true }
      });
    }

    if (!managerEmp && userId) {
      managerEmp = await this.prisma.employee.findFirst({
        where: { userId },
        select: { id: true, employeeCode: true, departmentId: true, firstName: true, lastName: true }
      });
    }

    const managerId = managerEmp?.id || requestingUser.employeeId || '';

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const endOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    const today = now;

    // Check if manager is HOD of any department or has a department
    const department = managerId
      ? await this.prisma.department.findFirst({
          where: { OR: [{ hodId: managerId }, { id: managerEmp?.departmentId || '' }] }
        })
      : null;
    const isDeptHOD = department?.hodId === managerId;

    // Build comprehensive team scope: direct reports OR department members, excluding self
    const teamConditions = [];
    if (managerId) teamConditions.push({ managerId });
    if (department?.id) teamConditions.push({ departmentId: department.id });

    const teamScope = teamConditions.length > 0
      ? { OR: teamConditions, ...(managerId ? { id: { not: managerId } } : {}) }
      : { isActive: true };

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
          OR: [
            { date: { gte: startOfToday, lte: endOfToday } },
            { clockIn: { gte: startOfToday, lte: endOfToday } }
          ],
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

      // 4. Leaves PENDING manager's action
      this.prisma.leave.findMany({
        where: {
          employee: teamScope,
          status: { in: ['PENDING', 'L1_APPROVED'] }
        },
        include: {
          employee: {
            select: { firstName: true, lastName: true, employeeCode: true, designation: { select: { name: true } } }
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
          employeeCode: true,
          designation: { select: { name: true } },
          attendances: {
            where: {
              OR: [
                { date: { gte: startOfToday, lte: endOfToday } },
                { clockIn: { gte: startOfToday, lte: endOfToday } }
              ]
            },
            orderBy: { clockIn: 'desc' },
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

    // Compute each team member's status: ON_LEAVE, PRESENT, CLOCKED_OUT, or YET_TO_CLOCK_IN
    const teamWithStatus = teamAttendanceToday.map((emp) => {
      const approvedLeaves = emp.leaves || [];
      const attendances = emp.attendances || [];
      const todayStatus = approvedLeaves.length > 0
        ? 'ON_LEAVE'
        : attendances.length > 0 && !attendances[0].clockOut
        ? 'PRESENT'
        : attendances.length > 0 && attendances[0].clockOut
        ? 'CLOCKED_OUT'
        : 'YET_TO_CLOCK_IN';

      return {
        id: emp.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        employeeCode: emp.employeeCode,
        designation: emp.designation,
        attendances: emp.attendances,
        leaves: emp.leaves,
        todayStatus
      };
    });

    const yetToClockIn = Math.max(0, teamSize - presentToday - onLeaveToday);

    return {
      stats: {
        teamSize,
        presentToday,
        onLeaveToday,
        yetToClockIn,
        leavesNeedingAction: leavesNeedingAction.length
      },
      teamLiveStatus: teamWithStatus,
      leavesNeedingAction,
      isHOD: isDeptHOD,
      profile: managerEmp ? { id: managerEmp.id, employeeCode: managerEmp.employeeCode, firstName: managerEmp.firstName, lastName: managerEmp.lastName } : null,
      department: department ? { id: department.id, name: department.name } : null
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
   *  METHOD 3: getEmployeeDashboard(requestingUser)
   * ════════════════════════════════════════════════════════════════════════ */
  async getEmployeeDashboard(requestingUser = {}) {
    const userId = requestingUser.sub || requestingUser.id || requestingUser.userId;
    let employeeId = requestingUser.employeeId;

    if (!employeeId && userId) {
      const emp = await this.prisma.employee.findFirst({
        where: { userId },
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

    const empQueryCondition = employeeId
      ? { OR: [{ id: employeeId }, ...(userId ? [{ userId }] : [])] }
      : { userId: userId || '' };

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
          employee: empQueryCondition,
          OR: [
            { date: { gte: startOfToday, lte: endOfToday } },
            { clockIn: { gte: startOfToday, lte: endOfToday } }
          ],
          clockOut: null
        },
        orderBy: { clockIn: 'desc' }
      }),

      // 2. This month's attendance count
      this.prisma.attendance.findMany({
        where: {
          employee: empQueryCondition,
          OR: [
            { date: { gte: startOfMonth, lte: endOfMonth } },
            { clockIn: { gte: startOfMonth, lte: endOfMonth } }
          ]
        },
        select: { date: true, clockIn: true, clockOut: true }
      }),

      // 3. Leave balances for all types
      this.prisma.leaveBalance.findMany({
        where: { employee: empQueryCondition, year: currentYear }
      }),

      // 4. Recent leave requests with approval chain
      this.prisma.leave.findMany({
        where: { employee: empQueryCondition },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          approvalLogs: {
            orderBy: { actedAt: 'asc' },
            include: {
              approver: { select: { firstName: true, lastName: true, employeeCode: true } }
            }
          }
        }
      }),

      // 5. Own profile with manager + HOD fallback + dept + designation
      this.prisma.employee.findFirst({
        where: empQueryCondition,
        include: {
          user: { select: { email: true, role: true } },
          department: {
            select: {
              id: true,
              name: true,
              hod: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  employeeCode: true,
                  designation: { select: { name: true } }
                }
              }
            }
          },
          designation: { select: { id: true, name: true } },
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeCode: true,
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
      monthSummary.map((a) => new Date(a.date || a.clockIn).toISOString().slice(0, 10))
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

    const yetToClockInDays = Math.max(0, workingDaysInMonth - distinctDaysPresent);

    return {
      today: {
        isClockedIn: !!todayAttendance,
        clockInTime: todayAttendance?.clockIn || null,
        hoursWorked: hoursToday,
        sessionId: todayAttendance?.id || null
      },
      monthStats: {
        daysPresent: distinctDaysPresent,
        daysAbsent: yetToClockInDays,
        totalHoursWorked: parseFloat(calculatedHours.toFixed(2))
      },
      leaveBalances,
      recentLeaves,
      profile
    };
  }
}

export default DashboardService;
