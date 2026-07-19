import { z } from 'zod';

export const createDesignationSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
  }),
});

export const batchCreateDesignationSchema = z.object({
  body: z.object({
    names: z.array(z.string().min(2).max(100)).min(1).max(50),
  }),
});

export const updateDesignationSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Designation UUID'),
  }),
  body: z.object({
    name: z.string().min(2).max(100),
  }),
});

export const idParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid Designation UUID'),
  }),
});
