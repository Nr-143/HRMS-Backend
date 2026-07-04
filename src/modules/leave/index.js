import LeaveService from './service.js';
import prisma from '../../config/prisma.js';
import redis from '../../config/redis.js';

export const leaveService = new LeaveService(prisma, redis);
