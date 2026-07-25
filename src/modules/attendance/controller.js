import { attendanceService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';

export const clockIn = async (req, res, next) => {
  try {
    const result = await attendanceService.clockIn(req.body);
    sendSuccess(res, result, 'Clock-in recorded successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const clockOut = async (req, res, next) => {
  try {
    const { attendanceId } = req.body;
    const result = await attendanceService.clockOut(attendanceId);
    sendSuccess(res, result, 'Clock-out recorded successfully', 200);
  } catch (error) {
    next(error);
  }
};

export const getMyAttendance = async (req, res, next) => {
  try {
    const result = await attendanceService.getMyAttendance();
    sendSuccess(res, result, 'Attendance logs fetched successfully', 200);
  } catch (error) {
    next(error);
  }
};

export const getEmployeeLogs = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const result = await attendanceService.getEmployeeAttendance(employeeId, req.scopeFilter);
    sendSuccess(res, result, 'Attendance logs fetched successfully', 200);
  } catch (error) {
    next(error);
  }
};

export const getMonthlySummary = async (req, res, next) => {
  try {
    const { month } = req.query;
    const result = await attendanceService.getMonthlySummary(month, req.scopeFilter);
    sendSuccess(res, result, 'Monthly summary fetched successfully', 200);
  } catch (error) {
    next(error);
  }
};

export const getLiveAttendance = async (req, res, next) => {
  try {
    const result = await attendanceService.getLiveAttendance();
    sendSuccess(res, result, 'Live attendance fetched successfully', 200);
  } catch (error) {
    next(error);
  }
};
