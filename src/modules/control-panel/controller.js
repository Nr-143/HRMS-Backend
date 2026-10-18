import { controlPanelService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';

export const getSettings = async (req, res, next) => {
  try {
    const result = await controlPanelService.getSettings(req.tenantId);
    sendSuccess(res, result, 'Control panel settings fetched successfully');
  } catch (error) {
    next(error);
  }
};

export const updateGeneralSettings = async (req, res, next) => {
  try {
    const result = await controlPanelService.updateGeneralSettings(req.tenantId, req.body);
    sendSuccess(res, result, 'General settings updated successfully');
  } catch (error) {
    next(error);
  }
};

export const updateWorkRules = async (req, res, next) => {
  try {
    const result = await controlPanelService.updateWorkRules(req.tenantId, req.body);
    sendSuccess(res, result, 'Work & attendance rules updated successfully');
  } catch (error) {
    next(error);
  }
};

export const updateLeavePolicy = async (req, res, next) => {
  try {
    const result = await controlPanelService.updateLeavePolicy(req.tenantId, req.body);
    sendSuccess(res, result, 'Leave quotas updated successfully');
  } catch (error) {
    next(error);
  }
};

export const updateNotificationSettings = async (req, res, next) => {
  try {
    const result = await controlPanelService.updateNotificationSettings(req.tenantId, req.body);
    sendSuccess(res, result, 'Notification settings updated successfully');
  } catch (error) {
    next(error);
  }
};

export const testSlackWebhook = async (req, res, next) => {
  try {
    const result = await controlPanelService.testSlackWebhook(req.tenantId, req.body.webhookUrl);
    sendSuccess(res, result, result.message);
  } catch (error) {
    next(error);
  }
};

