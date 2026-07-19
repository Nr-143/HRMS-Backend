import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { attendanceService } from '../modules/attendance/index.js';

const ADMIN_ROLES = new Set(['OWNER_ADMIN', 'ADMIN', 'HR']);

/**
 * Initialise the /attendance Socket.io namespace.
 * - Validates JWT from handshake.auth.token
 * - Joins admin-eligible users into tenant:{tenantId}:admins room
 * - Injects the io instance into AttendanceService so clock events can be emitted
 *
 * @param {import('socket.io').Server} io
 */
export function initAttendanceSocket(io) {
  // Inject io into service so clockIn/clockOut can emit events
  attendanceService.setSocketServer(io);

  const attendance = io.of('/attendance');

  // Middleware — validate JWT on every connection attempt
  attendance.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication token missing'));

      const payload = jwt.verify(token, env.JWT_SECRET);
      socket.user = payload; // { sub, tenantId, role, employeeId }
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  attendance.on('connection', (socket) => {
    const { tenantId, role } = socket.user;

    // Only ADMIN-level roles join the live feed room
    if (ADMIN_ROLES.has(role)) {
      socket.join(`tenant:${tenantId}:admins`);
    }

    socket.on('disconnect', () => {});
  });
}
