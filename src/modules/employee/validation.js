import { z } from 'zod';

export const createEmployeeSchema = z.object({
  body: z.object({
    firstName:     z.string().min(1, 'First name is required'),
    lastName:      z.string().min(1, 'Last name is required'),
    email:         z.string().email('Valid email is required'),
    dateOfJoining: z.string().refine((v) => !isNaN(Date.parse(v)), { message: 'Invalid date format' }),
    departmentId:  z.string().uuid('Invalid Department ID'),
    designationId: z.string().uuid('Invalid Designation ID'),
    phone:         z.string().optional(),
    managerId:     z.string().uuid('Invalid Manager ID').optional(),
    role:          z.enum(['EMPLOYEE', 'HR', 'MANAGER', 'ADMIN']).optional(),
  }),
});

export const updateEmployeeSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Employee UUID'),
  }),
  body: z.object({
    firstName:     z.string().min(1).optional(),
    lastName:      z.string().min(1).optional(),
    phone:         z.string().optional(),
    departmentId:  z.string().uuid('Invalid Department ID').optional(),
    designationId: z.string().uuid('Invalid Designation ID').optional(),
    managerId:     z.string().uuid('Invalid Manager ID').optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Employee UUID'),
  }),
});
