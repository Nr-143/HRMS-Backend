import NotificationService from './service.js';
import prisma from '../../config/prisma.js';
import redis from '../../config/redis.js';

export const notificationService = new NotificationService(prisma, redis);
