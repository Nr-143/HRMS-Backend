import { z } from 'zod';

export const createEmployeeSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    department: z.string().min(1, 'Department is required').optional(),
    email: z.string().email('Invalid user email').optional(), // Optional link to User login account
  }),
});

export const updateEmployeeSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Employee UUID format'),
  }),
  body: z.object({
    firstName: z.string().min(1, 'First name cannot be empty').optional(),
    lastName: z.string().min(1, 'Last name cannot be empty').optional(),
    department: z.string().min(1, 'Department cannot be empty').optional(),
  }),
});

export const getEmployeeSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Employee UUID format'),
  }),
});
