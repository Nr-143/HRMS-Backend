import { dashboardService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';

export const getAdminDashboard = async (req, res, next) => {
  try {
    const result = await dashboardService.getAdminDashboard();
    sendSuccess(res, result, 'Admin dashboard retrieved successfully');
  } catch (err) {
    next(err);
  }
};

export const getManagerDashboard = async (req, res, next) => {
  try {
    const result = await dashboardService.getManagerDashboard();
    sendSuccess(res, result, 'Manager dashboard retrieved successfully');
  } catch (err) {
    next(err);
  }
};

export const getEmployeeDashboard = async (req, res, next) => {
  try {
    const result = await dashboardService.getEmployeeDashboard();
    sendSuccess(res, result, 'Employee dashboard retrieved successfully');
  } catch (err) {
    next(err);
  }
};
