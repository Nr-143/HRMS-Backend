import EmployeeService from './service.js';
import prisma from '../../config/prisma.js';
import redis from '../../config/redis.js';

export const employeeService = new EmployeeService(prisma, redis);
