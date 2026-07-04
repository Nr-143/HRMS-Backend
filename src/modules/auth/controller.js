import { authService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';

export const registerTenant = async (req, res, next) => {
  try {
    const result = await authService.registerTenant(req.body);
    sendSuccess(res, result, 'Tenant registered successfully', 201);
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    sendSuccess(res, result, 'Logged in successfully', 200);
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    // req.user is populated by authenticate middleware
    await authService.logout(req.user.sub);
    sendSuccess(res, null, 'Logged out successfully', 200);
  } catch (error) {
    next(error);
  }
};
export const getSessionProfile = async (req, res, next) => {
  try {
    // Return decoded token info for checks
    sendSuccess(res, req.user, 'Active session profiles fetched', 200);
  } catch (error) {
    next(error);
  }
};
