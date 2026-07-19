import { designationService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';

export const createDesignation = async (req, res, next) => {
  try {
    const result = await designationService.create(req.body);
    sendSuccess(res, result, 'Designation created successfully', 201);
  } catch (err) {
    next(err);
  }
};

export const batchCreateDesignations = async (req, res, next) => {
  try {
    const result = await designationService.batchCreate(req.body.names);
    sendSuccess(res, result, 'Batch designation creation completed', 201);
  } catch (err) {
    next(err);
  }
};

export const getAllDesignations = async (req, res, next) => {
  try {
    const result = await designationService.findAll();
    sendSuccess(res, result, 'Designations retrieved successfully');
  } catch (err) {
    next(err);
  }
};

export const updateDesignation = async (req, res, next) => {
  try {
    const result = await designationService.update(req.params.id, req.body);
    sendSuccess(res, result, 'Designation updated successfully');
  } catch (err) {
    next(err);
  }
};

export const deleteDesignation = async (req, res, next) => {
  try {
    const result = await designationService.delete(req.params.id);
    sendSuccess(res, result, 'Designation deleted successfully');
  } catch (err) {
    next(err);
  }
};
