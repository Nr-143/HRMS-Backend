import { z } from 'zod';

export const clockInSchema = z.object({
  body: z.object({
    latitude:  z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }),
});

export const clockOutSchema = z.object({
  body: z.object({
    latitude:  z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  }),
});

export const employeeIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Employee UUID'),
  }),
});

export const summaryQuerySchema = z.object({
  query: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/, 'month must be YYYY-MM format').optional(),
  }),
});
