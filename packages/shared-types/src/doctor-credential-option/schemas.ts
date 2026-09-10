import { z } from 'zod';

/**
 * The three lists a doctor's printed credentials are drawn from (P19-T14).
 * One catalog rather than three tables: the columns, the screens and the rules
 * are identical, and only the list a field reads from differs.
 */
export const DOCTOR_CREDENTIAL_KINDS = ['TITLE', 'DEGREE', 'FIELD_OF_STUDY'] as const;

export const doctorCredentialKindSchema = z.enum(DOCTOR_CREDENTIAL_KINDS);

export type DoctorCredentialKindValue = z.infer<typeof doctorCredentialKindSchema>;

export const MAX_DOCTOR_DEGREE_CODES = 8;

/**
 * Stable upper-snake ASCII identifier (`SP_PD`). Deliberately narrow: the code
 * is what doctor profiles and education rows store, it is joined into a single
 * column for degrees, and it has to survive a locale change untouched, so it
 * carries no punctuation, no spaces and no comma.
 */
export const doctorCredentialCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(
    /^[A-Z][A-Z0-9_]*$/,
    'Code must be upper-snake ASCII, starting with a letter (for example SP_PD)',
  );

export const doctorCredentialLabelSchema = z.string().trim().min(1).max(120);

export const doctorCredentialSortOrderSchema = z.number().int().min(0).max(10_000);

export const listDoctorCredentialOptionsQuerySchema = z.object({
  kind: doctorCredentialKindSchema.optional(),
  // Deactivated options stay readable so an admin can see and revive them on
  // the master-data panel; every other caller gets the active list only.
  includeInactive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const createDoctorCredentialOptionSchema = z.object({
  kind: doctorCredentialKindSchema,
  code: doctorCredentialCodeSchema,
  label: doctorCredentialLabelSchema,
  sortOrder: doctorCredentialSortOrderSchema.optional().default(0),
});

export const updateDoctorCredentialOptionSchema = z
  .object({
    label: doctorCredentialLabelSchema.optional(),
    sortOrder: doctorCredentialSortOrderSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
  });

export const doctorDegreeCodesSchema = z
  .array(doctorCredentialCodeSchema)
  .max(MAX_DOCTOR_DEGREE_CODES)
  .refine((codes) => new Set(codes).size === codes.length, 'Degree codes must be unique');

export type ListDoctorCredentialOptionsInput = z.infer<
  typeof listDoctorCredentialOptionsQuerySchema
>;
export type CreateDoctorCredentialOptionInput = z.infer<
  typeof createDoctorCredentialOptionSchema
>;
export type UpdateDoctorCredentialOptionInput = z.infer<
  typeof updateDoctorCredentialOptionSchema
>;
