import { departmentService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';

export const createDepartment = async (req, res, next) => {
  try {
    const result = await departmentService.create(req.body);
    sendSuccess(res, result, 'Department created successfully', 201);
  } catch (err) {
    next(err);
  }
};

export const batchCreateDepartments = async (req, res, next) => {
  try {
    const result = await departmentService.batchCreate(req.body.names);
    sendSuccess(res, result, 'Batch department creation completed', 201);
  } catch (err) {
    next(err);
  }
};

export const getAllDepartments = async (req, res, next) => {
  try {
    const result = await departmentService.findAll();
    sendSuccess(res, result, 'Departments retrieved successfully');
  } catch (err) {
    next(err);
  }
};

export const updateDepartment = async (req, res, next) => {
  try {
    const result = await departmentService.update(req.params.id, req.body);
    sendSuccess(res, result, 'Department updated successfully');
  } catch (err) {
    next(err);
  }
};

export const deleteDepartment = async (req, res, next) => {
  try {
    const result = await departmentService.delete(req.params.id);
    sendSuccess(res, result, 'Department deleted successfully');
  } catch (err) {
    next(err);
  }
};
