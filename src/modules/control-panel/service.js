import { NotFoundError } from '../../utils/error.utils.js';
import { cache } from '../../utils/cache.utils.js';

class ControlPanelService {
  constructor(prisma, redis) {
    this.prisma = prisma;
    this.redis = redis;
  }

  /**
   * Retrieves full workspace settings along with live capacity metrics.
   */
  async getSettings(tenantId) {
    const cacheKey = `control_panel:settings:${tenantId}`;
    const cached = await cache.get(cacheKey, tenantId);
    if (cached) return cached;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) throw new NotFoundError('Workspace not found');

    // Calculate live capacity & quota stats
    const employeeCount = await this.prisma.employee.count({
      where: { tenantId, isActive: true },
    });

    const now = new Date();
    const trialEndsAt = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : null;
    let trialDaysRemaining = 0;
    if (trialEndsAt && trialEndsAt > now) {
      trialDaysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    const capacity = {
      usedEmployees: employeeCount,
      maxEmployees: tenant.maxEmployees,
      percentUsed: Math.min(100, Math.round((employeeCount / Math.max(1, tenant.maxEmployees)) * 100)),
      trialDaysRemaining,
      plan: tenant.plan,
      subscriptionStatus: tenant.subscriptionStatus,
      isTrial: tenant.subscriptionStatus === 'TRIAL',
    };

    const result = {
      settings: {
        id: tenant.id,
        companyCode: tenant.companyCode || `CMP-1001`,
        name: tenant.name,
        domain: tenant.domain,
        website: tenant.website || '',
        timezone: tenant.timezone || 'America/New_York',
        currency: tenant.currency || 'USD',
        weekStartsOn: tenant.weekStartsOn || 'Monday',
        standardHoursPerDay: tenant.standardHoursPerDay ?? 8.0,
        workStartTime: tenant.workStartTime || '09:00',
        workEndTime: tenant.workEndTime || '18:00',
        requireGeofence: Boolean(tenant.requireGeofence),
        geofenceRadiusMeters: tenant.geofenceRadiusMeters || 500,
        defaultWorkMode: tenant.defaultWorkMode || 'OFFICE',
        casualLeaveQuota: tenant.casualLeaveQuota ?? 12,
        sickLeaveQuota: tenant.sickLeaveQuota ?? 10,
        earnedLeaveQuota: tenant.earnedLeaveQuota ?? 15,
        emailNotifications: tenant.emailNotifications ?? true,
        attendanceReminders: tenant.attendanceReminders ?? true,
        slackWebhookUrl: tenant.slackWebhookUrl || '',
      },
      capacity,
    };

    // Cache for 5 minutes
    await cache.set(cacheKey, result, 300, tenantId);
    return result;
  }

  /**
   * Updates general branding and identity preferences.
   */
  async updateGeneralSettings(tenantId, data) {
    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.website !== undefined ? { website: data.website } : {}),
        ...(data.timezone ? { timezone: data.timezone } : {}),
        ...(data.currency ? { currency: data.currency } : {}),
        ...(data.weekStartsOn ? { weekStartsOn: data.weekStartsOn } : {}),
      },
    });

    await this.invalidateCache(tenantId);
    return this.getSettings(tenantId);
  }

  /**
   * Updates standard working hours, work day start/end, and geofencing.
   */
  async updateWorkRules(tenantId, data) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(data.standardHoursPerDay !== undefined ? { standardHoursPerDay: data.standardHoursPerDay } : {}),
        ...(data.workStartTime !== undefined ? { workStartTime: data.workStartTime } : {}),
        ...(data.workEndTime !== undefined ? { workEndTime: data.workEndTime } : {}),
        ...(data.requireGeofence !== undefined ? { requireGeofence: data.requireGeofence } : {}),
        ...(data.geofenceRadiusMeters !== undefined ? { geofenceRadiusMeters: data.geofenceRadiusMeters } : {}),
        ...(data.defaultWorkMode !== undefined ? { defaultWorkMode: data.defaultWorkMode } : {}),
      },
    });

    await this.invalidateCache(tenantId);
    return this.getSettings(tenantId);
  }

  /**
   * Updates default annual leave allocation quotas.
   */
  async updateLeavePolicy(tenantId, data) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(data.casualLeaveQuota !== undefined ? { casualLeaveQuota: data.casualLeaveQuota } : {}),
        ...(data.sickLeaveQuota !== undefined ? { sickLeaveQuota: data.sickLeaveQuota } : {}),
        ...(data.earnedLeaveQuota !== undefined ? { earnedLeaveQuota: data.earnedLeaveQuota } : {}),
      },
    });

    await this.invalidateCache(tenantId);
    return this.getSettings(tenantId);
  }

  /**
   * Updates notification and integration channels.
   */
  async updateNotificationSettings(tenantId, data) {
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(data.emailNotifications !== undefined ? { emailNotifications: data.emailNotifications } : {}),
        ...(data.attendanceReminders !== undefined ? { attendanceReminders: data.attendanceReminders } : {}),
        ...(data.slackWebhookUrl !== undefined ? { slackWebhookUrl: data.slackWebhookUrl } : {}),
      },
    });

    await this.invalidateCache(tenantId);
    return this.getSettings(tenantId);
  }

  /**
   * Tests a Slack webhook URL.
   */
  async testSlackWebhook(tenantId, webhookUrl) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const companyName = tenant?.name || 'HRMS Workspace';

    // Dispatches a test payload
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `🔔 *[HRMS Control Panel]* Test notification successfully delivered for *${companyName}*!`,
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook endpoint responded with status ${response.status}`);
      }

      return { success: true, message: 'Test message sent to Slack channel successfully.' };
    } catch (err) {
      return { success: false, message: `Webhook connection test failed: ${err.message}` };
    }
  }

  async invalidateCache(tenantId) {
    await cache.del(`control_panel:settings:${tenantId}`, tenantId);
  }
}

export default ControlPanelService;

