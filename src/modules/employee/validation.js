import { z } from 'zod';

export const createEmployeeSchema = z.object({
  body: z.object({
    firstName:     z.string().optional(),
    lastName:      z.string().optional(),
    name:          z.string().optional(),
    email:         z.string().email('Valid email is required'),
    dateOfJoining: z.string().optional(),
    joinDate:      z.string().optional(),
    departmentId:  z.string().optional(),
    department:    z.string().optional(),
    designationId: z.string().optional(),
    designation:   z.string().optional(),
    phone:         z.string().optional().nullable(),
    managerId:     z.string().optional().nullable(),
    role:          z.enum(['EMPLOYEE', 'HR', 'MANAGER', 'ADMIN', 'OWNER_ADMIN']).optional(),
    salary:        z.number().optional(),
    location:      z.string().optional(),
    status:        z.string().optional(),
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
