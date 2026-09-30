import { z } from 'zod';

import { addCalendarDays } from '#analytics/add-calendar-days';
import { addCalendarMonths } from '#analytics/add-calendar-months';
import { parseCalendarDate } from '#analytics/parse-calendar-date';
import { PAYER_TYPES, payerTypeSchema } from '#registration-flow/schemas';

/** The longest range any dashboard answers (PRD FR-FDN-03). */
export const ANALYTICS_MAX_RANGE_MONTHS = 24;

/** Who pays for the visit: the registration payer field (P29-T07). */
export const ANALYTICS_PAYER_TYPES = PAYER_TYPES;

export const analyticsPayerTypeSchema = payerTypeSchema;

const analyticsDateSchema = z
  .string()
  .refine((value) => parseCalendarDate(value) !== null, 'Use a real date in YYYY-MM-DD format');

const analyticsFilterObjectSchema = z.object({
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
});

/** The end must not come before the start, and the range spans at most 24 months. */
function refineAnalyticsRange(filter: { from: string; to: string }, ctx: z.RefinementCtx): void {
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
}

/**
 * The filter every analytics dashboard takes (PRD FR-FDN-03). Dates are the
 * clinic's local calendar dates, both ends included; the API turns them into
 * UTC instants in the clinic's time zone.
 */
export const analyticsFilterSchema = analyticsFilterObjectSchema.superRefine(refineAnalyticsRange);

/** The dashboards that export as CSV (P29-T10), in sidebar order. */
export const ANALYTICS_EXPORT_DASHBOARDS = [
  'operations',
  'finance',
  'case-mix',
  'reporting',
] as const;

export const analyticsExportDashboardSchema = z.enum(ANALYTICS_EXPORT_DASHBOARDS);

/**
 * The tables each dashboard exports, in the order the page shows them: the
 * checklist the web offers and the keys the API registers. A spec holds the
 * two lists to each other.
 */
export const ANALYTICS_EXPORT_TABLE_KEYS = {
  operations: [
    'summary',
    'visits-trend',
    'visits-by-poli',
    'visits-by-doctor',
    'booking-channels',
    'appointment-outcomes',
    'busiest-hours',
  ],
  finance: [
    'summary',
    'revenue-trend',
    'payment-methods',
    'service-types',
    'payers',
    'doctors',
    'outstanding',
  ],
  'case-mix': ['summary', 'top-diagnoses', 'groups', 'coding-by-poli', 'top-procedures'],
  reporting: ['satusehat', 'bpjs', 'readiness'],
} as const;

/**
 * A dashboard's CSV export (P29-T10, PRD FR-FDN-07): the dashboard's own
 * filter, plus `tables`, a comma-separated list of the tables to include.
 * Omitted, every table the dashboard shows is exported.
 */
export const analyticsExportQuerySchema = analyticsFilterObjectSchema
  .extend({
    tables: z
      .string()
      .trim()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(',')
              .map((key) => key.trim())
              .filter((key) => key.length > 0)
          : undefined,
      ),
  })
  .superRefine(refineAnalyticsRange);

export type AnalyticsPayerTypeValue = z.infer<typeof analyticsPayerTypeSchema>;
export type AnalyticsFilterInput = z.infer<typeof analyticsFilterSchema>;
export type AnalyticsExportDashboardValue = z.infer<typeof analyticsExportDashboardSchema>;
export type AnalyticsExportQueryInput = z.infer<typeof analyticsExportQuerySchema>;
