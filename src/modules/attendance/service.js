import { NotFoundError, BadRequestError } from '../../utils/error.utils.js';
import { getContext } from '../../utils/context.utils.js';

class AttendanceService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
    this.io = null; // injected after socket server initialises
  }

  /**
   * Attach the Socket.io server instance so service can emit live events.
   */
  setSocketServer(io) {
    this.io = io;
  }

  /**
   * Clock in — employeeId sourced from JWT context, never from request body.
   * Multiple sessions per day allowed. Warns (but allows) if open session exists.
   */
  async clockIn({ latitude, longitude }) {
    const { employeeId } = getContext();

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId },
      include: {
        department:  { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
      },
    });
    if (!employee) throw new NotFoundError('Employee profile not found');

    // Check for open session — warn but do not block (multiple sessions allowed)
    const openSession = await this.prisma.attendance.findFirst({
      where: { employeeId, clockOut: null },
    });

    const record = await this.prisma.attendance.create({
      data: {
        employeeId,
        date: new Date(),
        clockInLatitude:  latitude  ?? null,
        clockInLongitude: longitude ?? null,
      },
    });

    // Emit WebSocket event to admin room
    this._emitLiveEvent('attendance:clockIn', {
      attendanceId: record.id,
      employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      employeeCode: employee.employeeCode,
      department:   employee.department?.name ?? null,
      clockIn:      record.clockIn,
      latitude:     latitude  ?? null,
      longitude:    longitude ?? null,
    });

    return {
      ...record,
      warning: openSession ? 'An open session already existed. New session created.' : undefined,
    };
  }

  /**
   * Clock out — finds the most recent open session for the JWT employee.
   * No attendanceId required from client.
   */
  async clockOut({ latitude, longitude }) {
    const { employeeId } = getContext();

    const openSession = await this.prisma.attendance.findFirst({
      where: { employeeId, clockOut: null },
      orderBy: { clockIn: 'desc' },
    });

    if (!openSession) throw new BadRequestError('No open session found. Please clock in first.');

    const record = await this.prisma.attendance.update({
      where: { id: openSession.id },
      data: {
        clockOut:          new Date(),
        clockOutLatitude:  latitude  ?? null,
        clockOutLongitude: longitude ?? null,
      },
    });

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId },
      include: { department: { select: { name: true } } },
    });

    this._emitLiveEvent('attendance:clockOut', {
      attendanceId: record.id,
      employeeId,
      employeeName: employee ? `${employee.firstName} ${employee.lastName}` : null,
      department:   employee?.department?.name ?? null,
      clockOut:     record.clockOut,
      latitude:     latitude  ?? null,
      longitude:    longitude ?? null,
    });

    return record;
  }

  /**
   * Own attendance history — always scoped to JWT employeeId.
   */
  async getMyAttendance() {
    const { employeeId } = getContext();
    return await this.prisma.attendance.findMany({
      where: { employeeId },
      orderBy: { clockIn: 'desc' },
    });
  }

  /**
   * View attendance for a specific employee — RBAC scopeFilter applied.
   */
  async getEmployeeAttendance(employeeId, scopeFilter) {
    // Verify employee is accessible under the caller's scope
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, ...scopeFilter },
    });
    if (!employee) throw new NotFoundError('Employee not found or access denied');

    return await this.prisma.attendance.findMany({
      where: { employeeId },
      orderBy: { clockIn: 'desc' },
    });
  }

  /**
   * Monthly summary — ?month=YYYY-MM
   * Returns totalDaysPresent, totalHoursWorked, sessions array.
   */
  async getMonthlySummary(month, scopeFilter) {
    const { employeeId: ctxEmployeeId } = getContext();

    // Parse month param — default to current month
    const [year, mon] = month
      ? month.split('-').map(Number)
      : [new Date().getFullYear(), new Date().getMonth() + 1];

    const start = new Date(year, mon - 1, 1);
    const end   = new Date(year, mon, 1); // exclusive upper bound

    // Determine which employee(s) to summarise
    const whereEmployee = scopeFilter && Object.keys(scopeFilter).length > 0
      ? scopeFilter
      : { id: ctxEmployeeId };

    const records = await this.prisma.attendance.findMany({
      where: {
        employee: whereEmployee,
        date: { gte: start, lt: end },
      },
      orderBy: { clockIn: 'asc' },
    });

    // Distinct dates with at least one clock-in
    const distinctDates = new Set(records.map((r) => r.date.toISOString().split('T')[0]));
    const totalDaysPresent = distinctDates.size;

    // Total hours — only completed sessions (clockOut not null)
    let totalMinutes = 0;
    const sessions = records.map((r) => {
      let durationMinutes = null;
      if (r.clockOut) {
        durationMinutes = Math.round((r.clockOut - r.clockIn) / 60000);
        totalMinutes += durationMinutes;
      }
      return {
        id:              r.id,
        date:            r.date,
        clockIn:         r.clockIn,
        clockOut:        r.clockOut,
        durationMinutes,
      };
    });

    return {
      month:             `${year}-${String(mon).padStart(2, '0')}`,
      totalDaysPresent,
      totalHoursWorked:  parseFloat((totalMinutes / 60).toFixed(2)),
      sessions,
    };
  }

  /**
   * Live attendance — employees currently clocked in (no clockOut).
   * REST fallback for non-WebSocket clients.
   */
  async getLiveAttendance() {
    return await this.prisma.attendance.findMany({
      where: { clockOut: null },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            department:  { select: { name: true } },
            designation: { select: { name: true } },
          },
        },
      },
      orderBy: { clockIn: 'asc' },
    });
  }

  /**
   * Emit a Socket.io event to the tenant admin room if socket server is attached.
   */
  _emitLiveEvent(event, payload) {
    if (!this.io) return;
    const { tenantId } = getContext();
    this.io.of('/attendance').to(`tenant:${tenantId}:admins`).emit(event, payload);
  }
}

export default AttendanceService;
