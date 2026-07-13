import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { NotFoundError, UnauthorizedError, ConflictError } from '../../utils/error.utils.js';
import { cache } from '../../utils/cache.utils.js';
import { sendMail } from '../../utils/mail.utils.js';

const BCRYPT_ROUNDS = 12;

class AuthService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Register a new Tenant, User, and default Employee profile atomically.
   */
  async register({ companyName, domain, firstName, lastName, email, password }) {
    try {
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

      // Perform transaction to onboard tenant, user, and employee atomically
      const result = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: companyName,
            domain: domain || null,
            subscriptionStatus: 'TRIAL',
            plan: 'FREE',
            trialEndsAt,
            planExpiresAt: null,
            maxEmployees: 5,
          },
        });

        // Auto-create default department and designation (greytHR pattern)
        const department = await tx.department.create({
          data: {
            name: 'Management',
            tenantId: tenant.id,
          },
        });

        const designation = await tx.designation.create({
          data: {
            name: 'Administrator',
            tenantId: tenant.id,
          },
        });

        const user = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            role: 'OWNER_ADMIN',
            isOwner: true,
            tenantId: tenant.id,
            isActive: true,
          },
        });

        // employeeCode generation logic inside transaction
        const count = await tx.employee.count({
          where: { tenantId: tenant.id },
        });
        const capitals = companyName.replace(/[^A-Z]/g, '');
        let initials = capitals.substring(0, 2);
        if (initials.length < 2) {
          const clean = companyName.replace(/[^a-zA-Z]/g, '').toUpperCase();
          initials = clean.substring(0, 2).padEnd(2, 'X');
        }
        const generatedCode = `${initials}-${String(count + 1).padStart(3, '0')}`;

        const employee = await tx.employee.create({
          data: {
            firstName,
            lastName,
            employeeCode: generatedCode,
            userId: user.id,
            tenantId: tenant.id,
            departmentId: department.id,
            designationId: designation.id,
            dateOfJoining: new Date(),
            managerId: null,
            isActive: true,
          },
        });

        return { tenant, user, employee };
      });

      // Generate tokens after transaction succeeds
      const accessToken = jwt.sign(
        {
          sub: result.user.id,
          tenantId: result.tenant.id,
          role: result.user.role,
          employeeId: result.employee.id,
          subscriptionStatus: 'TRIAL',
          plan: 'FREE',
          trialEndsAt: result.tenant.trialEndsAt.toISOString(),
        },
        env.JWT_SECRET,
        { expiresIn: process.env.JWT_ACCESS_EXPIRES || env.JWT_EXPIRES_IN || '15m' }
      );

      const refreshToken = jwt.sign(
        { sub: result.user.id },
        env.JWT_REFRESH_SECRET,
        { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
      );

      // Store refresh token in Redis
      await this.redis.set(`refresh:${result.user.id}`, refreshToken, {
        EX: 7 * 24 * 60 * 60,
      });

      return {
        accessToken,
        refreshToken,
        tenant: {
          id: result.tenant.id,
          name: result.tenant.name,
          domain: result.tenant.domain,
          subscriptionStatus: result.tenant.subscriptionStatus,
          plan: result.tenant.plan,
          trialEndsAt: result.tenant.trialEndsAt,
        },
        user: {
          id: result.user.id,
          email: result.user.email,
          role: result.user.role,
        },
        employee: {
          id: result.employee.id,
          firstName: result.employee.firstName,
          lastName: result.employee.lastName,
          employeeCode: result.employee.employeeCode,
        },
      };
    } catch (error) {
      // Prisma P2002 error handling
      if (error.code === 'P2002') {
        const target = String(error.meta?.target || '');
        if (target.includes('email')) {
          throw {
            status: 409,
            code: 'EMAIL_EXISTS',
            message: 'An account with this email already exists',
          };
        }
        if (target.includes('domain')) {
          throw {
            status: 409,
            code: 'DOMAIN_EXISTS',
            message: 'This domain is already registered',
          };
        }
      }
      if (error.status && error.code) {
        throw error;
      }
      throw {
        status: 500,
        code: 'REGISTRATION_FAILED',
        message: error.message || 'Registration failed',
      };
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

    if (!user.isActive) {
      throw new UnauthorizedError('Account has been deactivated');
    }

    // Retrieve associated employeeId if one exists
    const employee = await this.prisma.employee.findFirst({
      where: { userId: user.id },
    });
    const employeeId = employee ? employee.id : null;

    // Sign JWT with employeeId, tenantId, and role
    const token = jwt.sign(
      {
        sub: user.id,
        tenantId: user.tenantId,
        role: user.role,
        employeeId,
      },
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
        employeeId,
      },
    };
  }

  /**
   * Fetch the full profile for the authenticated user.
   * Returns user details, employee profile, department, designation, and tenant info.
   */
  async getProfile(userId) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isOwner: true,
        isActive: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            domain: true,
            subscriptionStatus: true,
            plan: true,
            trialEndsAt: true,
            maxEmployees: true,
          },
        },
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            phone: true,
            dateOfJoining: true,
            isActive: true,
            department: {
              select: { id: true, name: true },
            },
            designation: {
              select: { id: true, name: true },
            },
            manager: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeCode: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isOwner: user.isOwner,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
      employee: user.employee
        ? {
            id: user.employee.id,
            firstName: user.employee.firstName,
            lastName: user.employee.lastName,
            employeeCode: user.employee.employeeCode,
            phone: user.employee.phone,
            dateOfJoining: user.employee.dateOfJoining,
            isActive: user.employee.isActive,
            department: user.employee.department,
            designation: user.employee.designation,
            manager: user.employee.manager,
          }
        : null,
      tenant: user.tenant,
    };
  }

  /**
   * Rotate refresh token and issue new access token.
   */
  async refreshToken(token) {
    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_REFRESH_SECRET);
    } catch (error) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const userId = decoded.sub;
    
    // Verify token exists in Redis to prevent replay of revoked tokens
    const activeToken = await this.redis.get(`refresh:${userId}`);
    if (!activeToken || activeToken !== token) {
      throw new UnauthorizedError('Refresh token is invalid or has been revoked');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('User account is not active');
    }

    // Generate new tokens
    const accessToken = jwt.sign(
      {
        sub: user.id,
        tenantId: user.tenantId,
        role: user.role,
        employeeId: user.employee ? user.employee.id : null,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    const newRefreshToken = jwt.sign(
      { sub: user.id },
      env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Rotate refresh token in Redis
    await this.redis.set(`refresh:${user.id}`, newRefreshToken, {
      EX: 7 * 24 * 60 * 60,
    });

    // Update access session cache
    await cache.set(`sess:${user.id}`, accessToken, env.SESSION_TTL, user.tenantId);

    return {
      accessToken,
      refreshToken: newRefreshToken,
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
   * Request password reset OTP.
   * Generates a 6-digit numeric OTP, saves it in Redis, and sends it via email.
   */
  async forgotPassword(email) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Silent success to prevent user enumeration
      return { email };
    }

    // Generate 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in Redis with a 5-minute (300 seconds) expiration window
    await this.redis.set(`otp:forget-password:${email}`, otp, {
      EX: 300,
    });

    // Send email notification
    await sendMail({
      to: email,
      subject: 'Password Reset OTP - HRMS',
      text: `Your password reset OTP code is: ${otp}\nThis code is valid for 5 minutes. If you did not request this, please ignore this email.`,
    });

    return { email };
  }

  /**
   * Reset user password using the OTP code.
   * Validates OTP and updates password.
   */
  async resetPassword({ email, otp, newPassword }) {
    const attemptKey = `otp-attempts:${email}`;
    const attempts = await this.redis.incr(attemptKey);
    
    if (attempts === 1) {
      await this.redis.expire(attemptKey, 300);
    }
    
    if (attempts > 5) {
      await this.redis.del(`otp:forget-password:${email}`);
      await this.redis.del(attemptKey);
      throw new UnauthorizedError('Too many OTP attempts. Please request a new code.');
    }

    const cachedOtp = await this.redis.get(`otp:forget-password:${email}`);

    if (!cachedOtp || cachedOtp !== otp) {
      throw new UnauthorizedError('OTP code is invalid or has expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Update password inside DB
    await this.prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });

    // Clean up OTP and attempts from Redis
    await this.redis.del(`otp:forget-password:${email}`);
    await this.redis.del(attemptKey);

    // Invalidate active user sessions to force re-authentication
    await cache.del(`sess:${user.id}`);

    return true;
  }

  /**
   * Change user password (authenticated flow).
   * Validates current password and updates to new password.
   */
  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedError('Incorrect current password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // Invalidate active session to force login again
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
