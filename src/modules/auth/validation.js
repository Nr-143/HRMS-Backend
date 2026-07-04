import { z } from 'zod';

export const registerTenantSchema = z.object({
  body: z.object({
    companyName: z.string().min(2, 'Company name must be at least 2 characters long'),
    domain: z.string().min(3, 'Domain must be at least 3 characters long').optional(),
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});
