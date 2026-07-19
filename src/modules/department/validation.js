import { z } from 'zod';

export const createDepartmentSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
  }),
});

export const batchCreateDepartmentSchema = z.object({
  body: z.object({
    names: z.array(z.string().min(2).max(100)).min(1).max(50),
  }),
});

export const updateDepartmentSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Department UUID'),
  }),
  body: z.object({
    name: z.string().min(2).max(100),
  }),
});

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Department UUID'),
  }),
});
