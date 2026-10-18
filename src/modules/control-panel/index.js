import ControlPanelService from './service.js';
import prisma from '../../config/prisma.js';
import redis from '../../config/redis.js';

export const controlPanelService = new ControlPanelService(prisma, redis);
export default controlPanelService;

