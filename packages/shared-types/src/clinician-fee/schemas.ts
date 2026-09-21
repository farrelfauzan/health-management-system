import { z } from 'zod';

import { moneyAmountSchema, serviceTariffCategorySchema } from '#billing/schemas';
import { taxReportPeriodSchema } from '#taxes/schemas';

/**
 * How a jasa medis rule states the clinician's share (P27-T06): a percentage
 * of what the patient paid for the line, or a fixed rupiah amount per unit.
 */
export const CLINICIAN_FEE_RULE_MODES = ['PERCENT', 'FIXED'] as const;

export const clinicianFeeRuleModeSchema = z.enum(CLINICIAN_FEE_RULE_MODES);

/** An accrual on payment; a reversal, signs flipped, when a paid invoice is voided. */
export const CLINICIAN_FEE_ENTRY_KINDS = ['ACCRUAL', 'REVERSAL'] as const;

export const clinicianFeeEntryKindSchema = z.enum(CLINICIAN_FEE_ENTRY_KINDS);

/** The four levels a rule can sit at, most specific first. */
export const CLINICIAN_FEE_RULE_LEVELS = [
  'CLINICIAN_TARIFF',
  'TARIFF',
  'CLINICIAN_CATEGORY',
  'CATEGORY',
] as const;

export const clinicianFeeRuleLevelSchema = z.enum(CLINICIAN_FEE_RULE_LEVELS);

export const MAX_CLINICIAN_FEE_PERCENT = 100;

export const CLINICIAN_FEE_RULE_OVERLAP_ERROR_CODE = 'CLINICIAN_FEE_RULE_OVERLAP';

export const CLINICIAN_FEE_RULE_TARGET_INVALID_ERROR_CODE = 'CLINICIAN_FEE_RULE_TARGET_INVALID';

const clinicianFeeCalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((value) => {
    const [year = 0, month = 0, day = 0] = value.split('-').map((part) => Number(part));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() + 1 === month &&
      parsed.getUTCDate() === day
    );
  }, 'Date must be a valid calendar date');

type ClinicianFeeRuleTerms = {
  mode: z.infer<typeof clinicianFeeRuleModeSchema>;
  value: number;
  effectiveFrom: string;
  effectiveTo?: string;
};

function isPercentWithinBounds(input: ClinicianFeeRuleTerms): boolean {
  return input.mode !== 'PERCENT' || input.value <= MAX_CLINICIAN_FEE_PERCENT;
}

function isEffectiveRangeOrdered(input: ClinicianFeeRuleTerms): boolean {
  return input.effectiveTo === undefined || input.effectiveTo >= input.effectiveFrom;
}

const PERCENT_MESSAGE = 'A percentage cannot exceed 100';

const RANGE_MESSAGE = 'The end date cannot be before the start date';

const clinicianFeeRuleTermsSchema = z.object({
  mode: clinicianFeeRuleModeSchema,
  value: moneyAmountSchema,
  effectiveFrom: clinicianFeeCalendarDateSchema,
  effectiveTo: clinicianFeeCalendarDateSchema.optional(),
});

/**
 * A new rule. The target is exactly one of a tariff or a tariff category; a
 * rule without `doctorId` is the clinic-wide default for its target.
 */
export const createClinicianFeeRuleSchema = clinicianFeeRuleTermsSchema
  .extend({
    serviceTariffId: z.string().uuid().optional(),
    category: serviceTariffCategorySchema.optional(),
    doctorId: z.string().uuid().optional(),
  })
  .refine((input) => (input.serviceTariffId === undefined) !== (input.category === undefined), {
    message: 'Choose either a tariff or a category',
    path: ['serviceTariffId'],
  })
  .refine(isPercentWithinBounds, { message: PERCENT_MESSAGE, path: ['value'] })
  .refine(isEffectiveRangeOrdered, { message: RANGE_MESSAGE, path: ['effectiveTo'] });

/**
 * The terms of an existing rule. Target and clinician are fixed at creation:
 * a different target is a different rule. The terms are replaced whole, so an
 * absent `effectiveTo` makes the rule open-ended.
 */
export const updateClinicianFeeRuleSchema = clinicianFeeRuleTermsSchema
  .refine(isPercentWithinBounds, { message: PERCENT_MESSAGE, path: ['value'] })
  .refine(isEffectiveRangeOrdered, { message: RANGE_MESSAGE, path: ['effectiveTo'] });

/** A calendar month, `YYYY-MM`, in the clinic's timezone. */
export const clinicianFeeStatementQuerySchema = z.object({
  period: taxReportPeriodSchema,
});

export type ClinicianFeeRuleModeValue = z.infer<typeof clinicianFeeRuleModeSchema>;
export type ClinicianFeeEntryKindValue = z.infer<typeof clinicianFeeEntryKindSchema>;
export type ClinicianFeeRuleLevelValue = z.infer<typeof clinicianFeeRuleLevelSchema>;
export type CreateClinicianFeeRuleInput = z.infer<typeof createClinicianFeeRuleSchema>;
export type UpdateClinicianFeeRuleInput = z.infer<typeof updateClinicianFeeRuleSchema>;
export type ClinicianFeeStatementQuery = z.infer<typeof clinicianFeeStatementQuerySchema>;
