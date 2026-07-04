import AuthService from './service.js';
import prisma from '../../config/prisma.js';
import redis from '../../config/redis.js';

// Instantiate the service using dependencies
export const authService = new AuthService(prisma, redis);
