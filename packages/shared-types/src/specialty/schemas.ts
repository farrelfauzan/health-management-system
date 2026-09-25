import { z } from 'zod';

/** Longest poli name the admin screen accepts. */
export const SPECIALTY_NAME_MAX_LENGTH = 100;

export const SPECIALTY_DESCRIPTION_MAX_LENGTH = 500;

/** Another poli already carries this name, compared without regard to case. */
export const SPECIALTY_NAME_TAKEN_ERROR_CODE = 'SPECIALTY_NAME_TAKEN';

/**
 * The poli cannot be deactivated while an active clinician practises under it
 * or an active tariff prices it; `details` carries the two counts.
 */
export const SPECIALTY_IN_USE_ERROR_CODE = 'SPECIALTY_IN_USE';

export const listSpecialtiesQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export const specialtyNameSchema = z.string().trim().min(2).max(SPECIALTY_NAME_MAX_LENGTH);

export const specialtyDescriptionSchema = z.string().trim().max(SPECIALTY_DESCRIPTION_MAX_LENGTH);

export const createSpecialtySchema = z.object({
  name: specialtyNameSchema,
  description: specialtyDescriptionSchema.optional(),
});

/**
 * Rename, re-describe, deactivate or reactivate one poli. `description: null`
 * clears it. Nothing here deletes: doctors, registrations and invoices keep
 * pointing at the row whatever the clinic does with it.
 */
export const updateSpecialtySchema = z
  .object({
    name: specialtyNameSchema.optional(),
    description: specialtyDescriptionSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field is required',
  });

export type ListSpecialtiesQueryInput = z.infer<typeof listSpecialtiesQuerySchema>;
export type CreateSpecialtyInput = z.infer<typeof createSpecialtySchema>;
export type UpdateSpecialtyInput = z.infer<typeof updateSpecialtySchema>;
