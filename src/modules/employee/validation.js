import { z } from 'zod';

export const createEmployeeSchema = z.object({
  body: z.object({
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    employeeCode: z.string().min(1, 'Employee code is required'),
    dateOfJoining: z.string().refine((val) => !isNaN(Date.parse(val)), {
      message: 'Date of joining must be a valid date format',
    }),
    phone: z.string().optional(),
    departmentId: z.string().uuid('Invalid Department ID format'),
    designationId: z.string().uuid('Invalid Designation ID format'),
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
    phone: z.string().optional(),
    departmentId: z.string().uuid('Invalid Department ID format').optional(),
    designationId: z.string().uuid('Invalid Designation ID format').optional(),
    isActive: z.boolean().optional(),
  }),
});

export const getEmployeeSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Employee UUID format'),
  }),
});
