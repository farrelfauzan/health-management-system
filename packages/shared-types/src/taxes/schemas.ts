import { z } from 'zod';

/**
 * Who the clinic is as a taxpayer (P27-T02, D-038 in `docs/post-mvp/decisions.md`).
 * The legal form decides which income-tax regime it may use under PP 55/2022 as
 * amended by PP 20/2026, so it is recorded rather than inferred from the name.
 */
export const taxpayerTypeSchema = z.enum([
  'INDIVIDUAL',
  'PT_PERORANGAN',
  'PT',
  'CV',
  'KOPERASI',
  'YAYASAN',
]);

/** `PP55_FINAL` is the 0.5% final tax on gross turnover; `GENERAL` is Pasal 17 / 31E. */
export const incomeTaxRegimeSchema = z.enum(['PP55_FINAL', 'GENERAL']);

/** Every taxpayer type and regime, in the order a form lists them. */
export const TAXPAYER_TYPES = taxpayerTypeSchema.options;
export const INCOME_TAX_REGIMES = incomeTaxRegimeSchema.options;

/**
 * What a stored NPWP looks like to Coretax: missing, the 15-digit format retired
 * with Coretax (kept and flagged, never rejected on an unrelated save), 16 digits,
 * or something that is neither.
 */
export const npwpStatusSchema = z.enum(['MISSING', 'LEGACY_15_DIGIT', 'VALID', 'INVALID']);

export const NPWP_DIGIT_COUNT = 16;
export const LEGACY_NPWP_DIGIT_COUNT = 15;
/** NITKU = the 16-digit NPWP plus a six-digit place-of-business suffix (PMK 136/2023). */
export const NITKU_DIGIT_COUNT = 22;
/** PP 23/2018 opened the final-tax scheme; no clinic can have started before it. */
export const PP55_EARLIEST_START_YEAR = 2018;
/**
 * PP 20/2026 (in force 22 April 2026) closed the scheme to a PT or CV that had
 * not started using it; one already on it finishes its original period.
 */
export const PP55_BADAN_TRANSITION_LAST_START_YEAR = 2026;

export const CLINIC_NPWP_INVALID_ERROR_CODE = 'CLINIC_NPWP_INVALID';
export const TAX_PP55_NOT_ELIGIBLE_ERROR_CODE = 'TAX_PP55_NOT_ELIGIBLE';
export const TAX_PKP_SINCE_REQUIRED_ERROR_CODE = 'TAX_PKP_SINCE_REQUIRED';
export const TAX_NITKU_NPWP_MISMATCH_ERROR_CODE = 'TAX_NITKU_NPWP_MISMATCH';

/** Digits only, after the separators people type (`01.234.567.8-901.000`). */
const nitkuSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s.-]/g, ''))
  .refine((value) => new RegExp(`^\\d{${NITKU_DIGIT_COUNT}}$`).test(value), {
    message: `NITKU must be ${NITKU_DIGIT_COUNT} digits`,
  });

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), {
    message: 'Not a calendar date',
  });

/**
 * A PATCH over the clinic's tax profile. `undefined` leaves a field alone and
 * `null` clears it. Rules that need the stored row as well as the request — PP 55
 * eligibility, the PKP date, the NITKU prefix — are the service's, because only
 * the merged state can be judged.
 */
export const updateTaxSettingsSchema = z
  .object({
    taxpayerType: taxpayerTypeSchema.nullable().optional(),
    incomeTaxRegime: incomeTaxRegimeSchema.optional(),
    pp55StartYear: z.number().int().min(PP55_EARLIEST_START_YEAR).max(2100).nullable().optional(),
    isPkp: z.boolean().optional(),
    pkpSince: calendarDateSchema.nullable().optional(),
    nitku: nitkuSchema.nullable().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: 'At least one field must be provided',
  });

export type TaxpayerTypeValue = z.infer<typeof taxpayerTypeSchema>;
export type IncomeTaxRegimeValue = z.infer<typeof incomeTaxRegimeSchema>;
export type NpwpStatusValue = z.infer<typeof npwpStatusSchema>;
export type UpdateTaxSettingsInput = z.infer<typeof updateTaxSettingsSchema>;
