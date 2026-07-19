import { z } from 'zod';

export const applyLeaveSchema = z.object({
  body: z.object({
    leaveType:  z.enum(['CASUAL', 'SICK', 'EARNED', 'UNPAID']),
    startDate:  z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid start date' }),
    endDate:    z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid end date' }),
    reason:     z.string().max(500).optional(),
  }),
});

export const rejectLeaveSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Leave UUID'),
  }),
  body: z.object({
    reason: z.string().min(1, 'Rejection reason is required').max(500),
  }),
});

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Leave UUID'),
  }),
});

export const employeeIdParamSchema = z.object({
  params: z.object({
    employeeId: z.string().uuid('Invalid Employee UUID'),
  }),
});
