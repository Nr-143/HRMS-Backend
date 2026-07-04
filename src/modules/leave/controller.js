import { leaveService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';

export const requestLeave = async (req, res, next) => {
  try {
    const result = await leaveService.requestLeave(req.body);
    sendSuccess(res, result, 'Leave request submitted successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const reviewLeave = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await leaveService.reviewLeave(id, status);
    sendSuccess(res, result, `Leave request has been ${status.toLowerCase()}`, 200);
  } catch (error) {
    next(error);
  }
};

export const getEmployeeLeaves = async (req, res, next) => {
  try {
    const { employeeId } = req.params;
    const result = await leaveService.getEmployeeLeaves(employeeId);
    sendSuccess(res, result, 'Employee leaves history fetched successfully', 200);
  } catch (error) {
    next(error);
  }
};
