import { employeeService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';

export const createEmployee = async (req, res, next) => {
  try {
    // Only pass validated request body parameters
    const result = await employeeService.createEmployee(req.body);
    sendSuccess(res, result, 'Employee created successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const updateEmployee = async (req, res, next) => {
  try {
    // Pass the payload along with the authorization scope filter
    const result = await employeeService.updateEmployee(req.params.id, req.body, req.scopeFilter);
    sendSuccess(res, result, 'Employee updated successfully', 200);
  } catch (error) {
    next(error);
  }
};

export const getEmployeeById = async (req, res, next) => {
  try {
    // Pass the authorization scope filter to restrict single record lookups
    const result = await employeeService.getEmployeeById(req.params.id, req.scopeFilter);
    sendSuccess(res, result, 'Employee retrieved successfully', 200);
  } catch (error) {
    next(error);
  }
};

export const getAllEmployees = async (req, res, next) => {
  try {
    // Pass the authorization scope filter to restrict list results
    const result = await employeeService.getAllEmployees(req.scopeFilter);
    sendSuccess(res, result, 'Employees listed successfully', 200);
  } catch (error) {
    next(error);
  }
};
