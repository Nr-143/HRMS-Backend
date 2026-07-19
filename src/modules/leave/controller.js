import { leaveService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';
import { getContext } from '../../utils/context.utils.js';

export const applyLeave = async (req, res, next) => {
  try {
    const result = await leaveService.apply(req.body);
    sendSuccess(res, result, 'Leave application submitted successfully', 201);
  } catch (err) {
    next(err);
  }
};

export const getLeaves = async (req, res, next) => {
  try {
    const result = await leaveService.getLeaves(req.scopeFilter);
    sendSuccess(res, result, 'Leaves retrieved successfully');
  } catch (err) {
    next(err);
  }
};

export const getLeaveById = async (req, res, next) => {
  try {
    const result = await leaveService.getLeaveById(req.params.id, req.scopeFilter);
    sendSuccess(res, result, 'Leave request retrieved successfully');
  } catch (err) {
    next(err);
  }
};

export const approveLeave = async (req, res, next) => {
  try {
    const { employeeId, role } = getContext();
    const result = await leaveService.approve(req.params.id, employeeId, role);
    sendSuccess(res, result, 'Leave approved successfully');
  } catch (err) {
    next(err);
  }
};

export const rejectLeave = async (req, res, next) => {
  try {
    const { employeeId, role } = getContext();
    const result = await leaveService.reject(req.params.id, employeeId, role, req.body.reason);
    sendSuccess(res, result, 'Leave rejected successfully');
  } catch (err) {
    next(err);
  }
};

export const cancelLeave = async (req, res, next) => {
  try {
    const { employeeId, role } = getContext();
    const result = await leaveService.cancel(req.params.id, employeeId, role);
    sendSuccess(res, result, 'Leave cancelled successfully');
  } catch (err) {
    next(err);
  }
};

export const getMyBalance = async (req, res, next) => {
  try {
    const { employeeId } = getContext();
    const result = await leaveService.getBalance(employeeId);
    sendSuccess(res, result, 'Leave balance retrieved successfully');
  } catch (err) {
    next(err);
  }
};

export const getEmployeeBalance = async (req, res, next) => {
  try {
    const result = await leaveService.getBalance(req.params.employeeId);
    sendSuccess(res, result, 'Employee leave balance retrieved successfully');
  } catch (err) {
    next(err);
  }
};
