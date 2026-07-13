import { authService } from './index.js';
import { sendSuccess } from '../../utils/response.utils.js';

export const registerTenant = async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
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

export const refreshToken = async (req, res, next) => {
  try {
    const result = await authService.refreshToken(req.body.refreshToken);
    sendSuccess(res, result, 'Token refreshed successfully', 200);
  } catch (error) {
    next(error);
  }
};
export const getSessionProfile = async (req, res, next) => {
  try {
    const profile = await authService.getProfile(req.user.sub);
    sendSuccess(res, profile, 'Profile fetched successfully', 200);
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req, res, next) => {
  try {
    const result = await authService.forgotPassword(req.body.email);
    sendSuccess(res, result, 'Verification OTP sent to your registered email address', 200);
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body;
    await authService.resetPassword({ email, otp, newPassword });
    sendSuccess(res, null, 'Password reset successfully', 200);
  } catch (error) {
    next(error);
  }
};

export const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user.sub, { currentPassword, newPassword });
    sendSuccess(res, null, 'Password changed successfully', 200);
  } catch (error) {
    next(error);
  }
};
