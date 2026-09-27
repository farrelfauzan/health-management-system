import { z } from 'zod';

import { addCalendarDays } from '#analytics/add-calendar-days';
import { addCalendarMonths } from '#analytics/add-calendar-months';
import { parseCalendarDate } from '#analytics/parse-calendar-date';

/** The longest range any dashboard answers (PRD FR-FDN-03). */
export const ANALYTICS_MAX_RANGE_MONTHS = 24;

/**
 * Who pays for the visit. Mirrors the registration payer field P29-T07 adds;
 * PRD Q-2 may add a category for company contracts.
 */
export const ANALYTICS_PAYER_TYPES = ['GENERAL', 'BPJS', 'INSURANCE'] as const;

export const analyticsPayerTypeSchema = z.enum(ANALYTICS_PAYER_TYPES);

const analyticsDateSchema = z
  .string()
  .refine((value) => parseCalendarDate(value) !== null, 'Use a real date in YYYY-MM-DD format');

/**
 * The filter every analytics dashboard takes (PRD FR-FDN-03). Dates are the
 * clinic's local calendar dates, both ends included; the API turns them into
 * UTC instants in the clinic's time zone.
 */
export const analyticsFilterSchema = z
  .object({
    from: analyticsDateSchema,
    to: analyticsDateSchema,
    // Query strings are always text, so the wire form is an enum that
    // becomes a boolean here, like `isActive` on the doctor directory.
    compare: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    specialtyId: z.string().uuid().optional(),
    doctorId: z.string().uuid().optional(),
    payerType: analyticsPayerTypeSchema.optional(),
  })
  .superRefine((filter, ctx) => {
    if (parseCalendarDate(filter.from) === null || parseCalendarDate(filter.to) === null) {
      return;
    }
    if (filter.to < filter.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'The end date cannot be before the start date',
      });
      return;
    }
    const latestAllowedTo = addCalendarDays(
      addCalendarMonths(filter.from, ANALYTICS_MAX_RANGE_MONTHS),
      -1,
    );
    if (filter.to > latestAllowedTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: `Choose a range of at most ${ANALYTICS_MAX_RANGE_MONTHS} months`,
      });
    }
  });

export type AnalyticsPayerTypeValue = z.infer<typeof analyticsPayerTypeSchema>;
export type AnalyticsFilterInput = z.infer<typeof analyticsFilterSchema>;
