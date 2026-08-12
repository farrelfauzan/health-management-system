import { z } from 'zod';

/**
 * The password policy for anywhere a password is *set* (SJ-7).
 *
 * Length only, following NIST 800-63B: composition rules push people towards
 * `Password1!` and buy nothing measurable, while length and a breach check —
 * enforced server-side in `BreachedPasswordCheckerService` — buy most of the
 * protection. Twelve characters is the floor, and there is no maximum beyond
 * a sanity bound, because a passphrase should never be rejected for being
 * long.
 *
 * Deliberately **not** applied to the login schema: raising the floor there
 * would lock out every existing account whose password predates this rule.
 */
export const passwordPolicySchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(200);

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
  password: passwordPolicySchema,
  isActive: z.boolean().optional().default(true),
  roleCodes: z.array(z.string().min(1)).min(1),
});

export const updateAdminUserSchema = z
  .object({
    email: z.string().email().optional(),
    password: passwordPolicySchema.optional(),
    isActive: z.boolean().optional(),
    roleCodes: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
  });

export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;
