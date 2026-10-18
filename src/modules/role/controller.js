import prisma from '../../config/prisma.js';
import RoleService from './service.js';
import { sendSuccess } from '../../utils/response.utils.js';

const roleService = new RoleService(prisma);

export const getRoles = async (req, res, next) => {
  try {
    const roles = await roleService.getRoles(req.tenantId);
    sendSuccess(res, roles, 'Roles retrieved successfully');
  } catch (error) {
    next(error);
  }
};

export const getPermissions = async (req, res, next) => {
  try {
    const permissions = roleService.getPermissions();
    sendSuccess(res, permissions, 'Permissions matrix retrieved successfully');
  } catch (error) {
    next(error);
  }
};

export const updateUserRole = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { role } = req.body;
    const updatedById = req.user.sub;
    const tenantId = req.tenantId;

    const result = await roleService.updateUserRole({
      userId,
      newRole: role,
      updatedById,
      tenantId,
    });

    sendSuccess(res, result, `User role updated successfully to ${role}`);
  } catch (error) {
    next(error);
  }
};
