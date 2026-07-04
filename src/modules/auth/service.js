import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { NotFoundError, UnauthorizedError, ConflictError } from '../../utils/error.utils.js';
import { cache } from '../../utils/cache.utils.js';

class AuthService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Register a new Tenant with subscription trial and Admin user atomically.
   */
  async register({ companyName, email, password }) {
    try {
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const hashedPassword = await bcrypt.hash(password, 10);

      // Perform transaction to onboard tenant and user atomically
      const result = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: companyName,
            subscriptionStatus: 'TRIAL',
            plan: 'FREE',
            trialEndsAt,
            planExpiresAt: null,
            maxEmployees: 5,
          },
        });

        const user = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            role: 'ADMIN',
            tenantId: tenant.id,
            isActive: true,
          },
        });

        return { tenant, user };
      });

      // Generate accessToken
      const accessToken = jwt.sign(
        {
          sub: result.user.id,
          tenantId: result.tenant.id,
          role: 'ADMIN',
          employeeId: null,
          subscriptionStatus: 'TRIAL',
          plan: 'FREE',
          trialEndsAt: result.tenant.trialEndsAt.toISOString(),
        },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN }
      );

      // Generate refreshToken
      const refreshToken = jwt.sign(
        { sub: result.user.id },
        env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      // Store in Redis as: refresh:{user.id} with TTL 7 days
      await this.redis.set(`refresh:${result.user.id}`, refreshToken, {
        EX: 7 * 24 * 60 * 60,
      });

      return {
        accessToken,
        refreshToken,
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          subscriptionStatus: result.tenant.subscriptionStatus,
          plan: result.tenant.plan,
          trialEndsAt: result.tenant.trialEndsAt,
        },
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
        },
      };
    } catch (error) {
      // Handle unique email constraint error from Prisma (P2002)
      if (error.code === 'P2002') {
        throw {
          status: 409,
          code: 'EMAIL_EXISTS',
          message: 'An account with this email already exists',
        };
      }
      throw error;
    }
  }

  /**
   * Log in user, issue session token, and cache it in Redis
   */
  async login({ email, password }) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    // Sign JWT
    const token = jwt.sign(
      { sub: user.id, tenantId: user.tenantId, role: user.role },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    // Cache session in Redis using tenant-scoped helper
    await cache.set(`sess:${user.id}`, token, env.SESSION_TTL, user.tenantId);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
      },
    };
  }

  /**
   * Log out user and delete cached session from Redis
   */
  async logout(userId) {
    await cache.del(`sess:${userId}`);
    return true;
  }

  /**
   * Verify token and ensure active session exists in Redis
   */
  async verifySession(token) {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    // Verify session still exists in Redis using decoded tenantId as override
    const activeToken = await cache.get(`sess:${decoded.sub}`, decoded.tenantId);
    if (!activeToken || activeToken !== token) {
      throw new UnauthorizedError('Session has expired or is logged out');
    }

    return decoded; // Returns payload { sub, tenantId, role }
  }
}

export default AuthService;
