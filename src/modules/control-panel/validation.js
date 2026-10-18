import { z } from 'zod';

export const updateGeneralSettingsSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    website: z.string().url().or(z.literal('')).optional(),
    timezone: z.string().min(2).max(50).optional(),
    currency: z.string().min(1).max(10).optional(),
    weekStartsOn: z.enum(['Monday', 'Sunday', 'Saturday']).optional(),
  }),
});

export const updateWorkRulesSchema = z.object({
  body: z.object({
    standardHoursPerDay: z.number().min(1).max(24).optional(),
    workStartTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Must be in HH:MM format').optional(),
    workEndTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Must be in HH:MM format').optional(),
    requireGeofence: z.boolean().optional(),
    geofenceRadiusMeters: z.number().int().min(50).max(50000).optional(),
    defaultWorkMode: z.enum(['OFFICE', 'REMOTE', 'HYBRID']).optional(),
  }),
});

export const updateLeavePolicySchema = z.object({
  body: z.object({
    casualLeaveQuota: z.number().int().min(0).max(100).optional(),
    sickLeaveQuota: z.number().int().min(0).max(100).optional(),
    earnedLeaveQuota: z.number().int().min(0).max(100).optional(),
  }),
});

export const updateNotificationSettingsSchema = z.object({
  body: z.object({
    emailNotifications: z.boolean().optional(),
    attendanceReminders: z.boolean().optional(),
    slackWebhookUrl: z.string().url().or(z.literal('')).nullable().optional(),
  }),
});

export const testWebhookSchema = z.object({
  body: z.object({
    webhookUrl: z.string().url('Must be a valid URL'),
  }),
});

