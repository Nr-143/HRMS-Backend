import { z } from 'zod';

export const clockInSchema = z.object({
  body: z.object({
    employeeId: z.string().optional(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
    location: z.any().optional(),
  }),
});

export const clockOutSchema = z.object({
  body: z.object({
    attendanceId: z.string().optional(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
    location: z.any().optional(),
  }),
});
