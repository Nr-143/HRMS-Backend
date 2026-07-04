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
   * Onboard a new Tenant and create the admin user / employee profile
   */
  async registerTenant({ companyName, domain, email, password, firstName, lastName }) {
    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictError('A user with this email address already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Perform transaction to onboard tenant and user atomically
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: companyName,
          domain,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          role: 'ADMIN',
          tenantId: tenant.id,
        },
      });

      const employee = await tx.employee.create({
        data: {
          firstName,
          lastName,
          userId: user.id,
          tenantId: tenant.id,
        },
      });

      return { tenant, user, employee };
    });

    return {
      tenantId: result.tenant.id,
      companyName: result.tenant.name,
      adminUser: {
        id: result.user.id,
        email: result.user.email,
        role: result.user.role,
      },
    };
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
