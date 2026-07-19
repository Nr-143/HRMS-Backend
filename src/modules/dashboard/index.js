import DashboardService from './service.js';
import prisma from '../../config/prisma.js';

export const dashboardService = new DashboardService(prisma);
