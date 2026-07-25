import { z } from 'zod';

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().min(1).optional(),
  roleCode: z.string().trim().min(1).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const createAdminUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  isActive: z.boolean().optional().default(true),
  roleCodes: z.array(z.string().min(1)).min(1),
});

export const updateAdminUserSchema = z
  .object({
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    isActive: z.boolean().optional(),
    roleCodes: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
  });

export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;
