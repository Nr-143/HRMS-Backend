import DesignationService from './service.js';
import prisma from '../../config/prisma.js';

export const designationService = new DesignationService(prisma);
