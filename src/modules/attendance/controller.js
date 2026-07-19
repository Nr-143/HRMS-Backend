import { attendanceService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';

export const clockIn = async (req, res, next) => {
  try {
    const result = await attendanceService.clockIn(req.body);
    sendSuccess(res, result, 'Clock-in recorded successfully', 201);
  } catch (err) {
    next(err);
  }
};

export const clockOut = async (req, res, next) => {
  try {
    const result = await attendanceService.clockOut(req.body);
    sendSuccess(res, result, 'Clock-out recorded successfully');
  } catch (err) {
    next(err);
  }
};

export const getMyAttendance = async (req, res, next) => {
  try {
    const result = await attendanceService.getMyAttendance();
    sendSuccess(res, result, 'Attendance history retrieved successfully');
  } catch (err) {
    next(err);
  }
};

export const getEmployeeAttendance = async (req, res, next) => {
  try {
    const result = await attendanceService.getEmployeeAttendance(req.params.id, req.scopeFilter);
    sendSuccess(res, result, 'Employee attendance retrieved successfully');
  } catch (err) {
    next(err);
  }
};

export const getMonthlySummary = async (req, res, next) => {
  try {
    const result = await attendanceService.getMonthlySummary(req.query.month, req.scopeFilter);
    sendSuccess(res, result, 'Monthly summary retrieved successfully');
  } catch (err) {
    next(err);
  }
};

export const getLiveAttendance = async (req, res, next) => {
  try {
    const result = await attendanceService.getLiveAttendance();
    sendSuccess(res, result, 'Live attendance retrieved successfully');
  } catch (err) {
    next(err);
  }
};
