import { employeeService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';

export const createEmployee = async (req, res, next) => {
  try {
    const result = await employeeService.createEmployee(req.body);
    sendSuccess(res, result, 'Employee created successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const updateEmployee = async (req, res, next) => {
  try {
    const result = await employeeService.updateEmployee(req.params.id, req.body);
    sendSuccess(res, result, 'Employee updated successfully', 200);
  } catch (error) {
    next(error);
  }
};

export const getEmployeeById = async (req, res, next) => {
  try {
    const result = await employeeService.getEmployeeById(req.params.id);
    sendSuccess(res, result, 'Employee retrieved successfully', 200);
  } catch (error) {
    next(error);
  }
};

export const getAllEmployees = async (req, res, next) => {
  try {
    const result = await employeeService.getAllEmployees();
    sendSuccess(res, result, 'Employees listed successfully', 200);
  } catch (error) {
    next(error);
  }
};
