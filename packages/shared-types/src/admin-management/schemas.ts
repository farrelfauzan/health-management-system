import { z } from 'zod';

import { nikSchema } from '#patient-management/schemas';

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

/**
 * The address field, named so the edit form can validate against it directly.
 * `updateAdminUserSchema` carries a `.refine`, which makes it a `ZodEffects`
 * with no `.shape` to reach into.
 */
export const adminUserEmailSchema = z.string().email();

/**
 * The name a human account carries (D-027, P20-T05).
 *
 * The same bounds `createDoctorSchema` has used since D-024, so a doctor's
 * name does not change shape when it moves onto the account, and named here so
 * every screen that collects one validates against one rule.
 */
export const userFullNameSchema = z.string().trim().min(2).max(120);

export const createAdminUserSchema = z.object({
  email: adminUserEmailSchema,
  fullName: userFullNameSchema,
  password: passwordPolicySchema,
  isActive: z.boolean().optional().default(true),
  roleCodes: z.array(z.string().min(1)).min(1),
});

export const updateAdminUserSchema = z
  .object({
    email: adminUserEmailSchema.optional(),
    fullName: userFullNameSchema.optional(),
    password: passwordPolicySchema.optional(),
    isActive: z.boolean().optional(),
    roleCodes: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
  });

/**
 * What a person may correct about their own account: the name, and nothing
 * else. Roles, status, organisation unit and the sign-in address stay
 * administrative — the same split D-025 made for doctors.
 */
export const updateOwnAccountSchema = z.object({
  fullName: userFullNameSchema,
});

/**
 * The operator's own NIK (P24-T15, D-039): the `agent_nik` SATUSEHAT's KYC
 * requires of whoever is at the desk. Sixteen digits, normalised by the same
 * schema a patient's NIK goes through, stored encrypted with a blind index.
 * There is no clearing form: an operator who no longer wants KYC simply does
 * not use it, and a NIK on file costs nothing.
 */
export const updateOwnAccountNikSchema = z.object({
  nik: nikSchema,
});

export type ListUsersQueryInput = z.infer<typeof listUsersQuerySchema>;
export type UpdateOwnAccountInput = z.infer<typeof updateOwnAccountSchema>;
export type UpdateOwnAccountNikInput = z.infer<typeof updateOwnAccountNikSchema>;
export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;
export type UpdateAdminUserInput = z.infer<typeof updateAdminUserSchema>;
