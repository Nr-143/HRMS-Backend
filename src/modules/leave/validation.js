import { z } from 'zod';

export const requestLeaveSchema = z.object({
  body: z.object({
    employeeId: z.string().uuid('Invalid Employee ID'),
    startDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Start date must be a valid date format',
    }),
    endDate: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'End date must be a valid date format',
    }),
    type: z.string().default('CASUAL'), // e.g., CASUAL, SICK, ANNUAL
    reason: z.string().max(500).optional(),
  }),
});

export const reviewLeaveSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Leave record UUID'),
  }),
  body: z.object({
    status: z.enum(['APPROVED', 'REJECTED'], {
      errorMap: () => ({ message: 'Status must be APPROVED or REJECTED' }),
    }),
  }),
});
