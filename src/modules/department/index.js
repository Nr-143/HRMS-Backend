import DepartmentService from './service.js';
import prisma from '../../config/prisma.js';

export const departmentService = new DepartmentService(prisma);
