import { employeeService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';

export const createEmployee = async (req, res, next) => {
  try {
    const result = await employeeService.createEmployee(req.body);
    sendSuccess(res, result, 'Employee onboarded successfully', 201);
  } catch (err) {
    next(err);
  }
};

export const getAllEmployees = async (req, res, next) => {
  try {
    const result = await employeeService.getAllEmployees(req.scopeFilter);
    sendSuccess(res, result, 'Employees retrieved successfully');
  } catch (err) {
    next(err);
  }
};

export const getEmployeeById = async (req, res, next) => {
  try {
    const result = await employeeService.getEmployeeById(req.params.id, req.scopeFilter);
    sendSuccess(res, result, 'Employee retrieved successfully');
  } catch (err) {
    next(err);
  }
};

export const updateEmployee = async (req, res, next) => {
  try {
    const result = await employeeService.updateEmployee(req.params.id, req.body, req.scopeFilter);
    sendSuccess(res, result, 'Employee updated successfully');
  } catch (err) {
    next(err);
  }
};

export const deleteEmployee = async (req, res, next) => {
  try {
    const result = await employeeService.deleteEmployee(req.params.id);
    sendSuccess(res, result, 'Employee deactivated successfully');
  } catch (err) {
    next(err);
  }
};

export const reactivateEmployee = async (req, res, next) => {
  try {
    const result = await employeeService.reactivateEmployee(req.params.id);
    sendSuccess(res, result, 'Employee reactivated successfully');
  } catch (err) {
    next(err);
  }
};

export const getOrgChart = async (req, res, next) => {
  try {
    const result = await employeeService.getOrgChart();
    sendSuccess(res, result, 'Org chart retrieved successfully');
  } catch (err) {
    next(err);
  }
};
