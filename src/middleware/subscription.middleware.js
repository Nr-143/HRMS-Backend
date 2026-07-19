import { AppError } from '../utils/error.utils.js';
import prisma from '../config/prisma.js';

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * checkSubscription — reads subscription state from JWT payload (zero DB calls).
 * Position: after authenticate, before authorize.
 *
 * SUSPENDED          → 403 always
 * Expired trial/plan → 402 on writes, pass-through on reads
 * Active/valid trial → pass-through
 */
export const checkSubscription = (req, res, next) => {
  const { subscriptionStatus, trialEndsAt, planExpiresAt } = req.user;
  const now = Date.now();

  // Hard block — account suspended
  if (subscriptionStatus === 'SUSPENDED') {
    return next(new AppError('Account suspended. Contact support@yourhrms.com', 403));
  }

  // Determine if subscription window has lapsed
  let expired = false;

  if (subscriptionStatus === 'TRIAL') {
    expired = trialEndsAt ? now > new Date(trialEndsAt).getTime() : false;
  } else if (subscriptionStatus === 'ACTIVE') {
    expired = planExpiresAt ? now > new Date(planExpiresAt).getTime() : false;
  }

  if (!expired) return next();

  // Expired — reads allowed, writes blocked
  if (WRITE_METHODS.has(req.method)) {
    return next(new AppError('Your subscription has expired. Upgrade at /billing to continue.', 402));
  }

  // Read-only pass-through — attach flag for downstream use if needed
  req.subscriptionExpired = true;
  next();
};

/**
 * checkEmployeeLimit — DB call to count active employees against plan limit.
 * Apply only on POST /employees.
 */
export const checkEmployeeLimit = async (req, res, next) => {
  try {
    const { maxEmployees, plan } = req.user;

    const count = await prisma.employee.count({ where: { isActive: true } });

    if (count >= maxEmployees) {
      return next(
        new AppError(
          `Your ${plan} plan supports a maximum of ${maxEmployees} employees. Upgrade to add more.`,
          402
        )
      );
    }

    next();
  } catch (err) {
    next(err);
  }
};
