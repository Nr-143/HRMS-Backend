import { notificationService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';

export const sendNotification = async (req, res, next) => {
  try {
    const result = await notificationService.sendNotification(req.body);
    sendSuccess(res, result, 'Notification processed/queued successfully', 202);
  } catch (error) {
    next(error);
  }
};
