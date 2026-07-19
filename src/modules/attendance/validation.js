import { z } from 'zod';

export const clockInSchema = z.object({
  body: z.object({
    employeeId: z.string().uuid('Invalid Employee ID'),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }),
});

export const clockOutSchema = z.object({
  body: z.object({
    attendanceId: z.string().uuid('Invalid Attendance record ID'),
  }),
});
