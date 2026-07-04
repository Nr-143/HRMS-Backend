import { NotFoundError, BadRequestError } from '../../utils/error.utils.js';

class AttendanceService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Log clock-in time and location coordinates for an employee
   */
  async clockIn({ employeeId, latitude, longitude }) {
    // 1. Verify that employee exists (scoped to tenant automatically)
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId },
    });

    if (!employee) {
      throw new NotFoundError('Employee not found in this company context');
    }

    // 2. Check if already clocked in today without clocking out
    const activeSession = await this.prisma.attendance.findFirst({
      where: {
        employeeId,
        clockOut: null,
      },
    });

    if (activeSession) {
      throw new BadRequestError('Employee is already clocked in');
    }

    return await this.prisma.attendance.create({
      data: {
        employeeId,
        latitude,
        longitude,
      },
    });
  }

  /**
   * Log clock-out time for a specific attendance record
   */
  async clockOut(attendanceId) {
    // 1. Find the active clock-in session (scoped to tenant automatically)
    const record = await this.prisma.attendance.findFirst({
      where: { id: attendanceId },
    });

    if (!record) {
      throw new NotFoundError('Attendance record not found');
    }

    if (record.clockOut) {
      throw new BadRequestError('Employee has already clocked out for this session');
    }

    return await this.prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        clockOut: new Date(),
      },
    });
  }

  /**
   * Retrieve all attendance logs for an employee. Scoped automatically.
   */
  async getEmployeeAttendanceLogs(employeeId) {
    // Verify employee ownership (scoped automatically)
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId },
    });

    if (!employee) {
      throw new NotFoundError('Employee not found');
    }

    return await this.prisma.attendance.findMany({
      where: { employeeId },
      orderBy: { clockIn: 'desc' },
    });
  }
}

export default AttendanceService;
