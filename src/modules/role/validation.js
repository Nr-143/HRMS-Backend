import { z } from 'zod';

export const roleEnum = z.enum([
  'SUPER_ADMIN',
  'OWNER_ADMIN',
  'ADMIN',
  'HR',
  'MANAGER',
  'EMPLOYEE',
]);

export const updateUserRoleSchema = z.object({
  body: z.object({
    role: roleEnum,
  }),
  params: z.object({
    id: z.string().uuid('User ID must be a valid UUID'),
  }),
});

export const userIdParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('User ID must be a valid UUID'),
  }),
});
