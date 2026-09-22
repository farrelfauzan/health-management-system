import { z } from 'zod';

/** A `YYYY-MM-DD` clinic-local calendar date. */
const dueDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

/** The widest window the due worklist answers for in one request. */
export const MATERNAL_VISITS_DUE_MAX_RANGE_DAYS = 31;

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * Which existing schedule a due row comes from (P25-T17). Each has its own
 * rule and its own owner; the worklist only gathers them:
 * `ANTENATAL` the trimester visit counts (P25-T06), `POSTNATAL` the KF/KN
 * windows (P25-T12), `FAMILY_PLANNING` a KB course's next due date (P25-T14)
 * and `SHK` an untaken heel-prick sample (P25-T10).
 */
export const maternalVisitDueSourceSchema = z.enum([
  'ANTENATAL',
  'POSTNATAL',
  'FAMILY_PLANNING',
  'SHK',
]);

export type MaternalVisitDueSourceValue = z.infer<typeof maternalVisitDueSourceSchema>;

/**
 * Whom the visit is for. The row's `patientId` is always the person who is
 * reminded — the mother for a baby's KN visit or SHK sample.
 */
export const maternalVisitDueSubjectSchema = z.enum(['PATIENT', 'NEWBORN']);

export type MaternalVisitDueSubjectValue = z.infer<typeof maternalVisitDueSubjectSchema>;

function countRangeDays(from: string, to: string): number {
  return (
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) /
    MILLISECONDS_PER_DAY
  );
}

/**
 * `GET /maternal-visits/due`. Both bounds are inclusive clinic-local dates;
 * without them the week starting today on the clinic's clock is used.
 */
export const listMaternalVisitsDueQuerySchema = z
  .object({
    from: dueDateSchema.optional(),
    to: dueDateSchema.optional(),
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.from <= query.to, {
    message: '`from` must not be after `to`',
    path: ['to'],
  })
  .refine(
    (query) =>
      query.from === undefined ||
      query.to === undefined ||
      countRangeDays(query.from, query.to) < MATERNAL_VISITS_DUE_MAX_RANGE_DAYS,
    {
      message: `The range may span at most ${MATERNAL_VISITS_DUE_MAX_RANGE_DAYS} days`,
      path: ['to'],
    },
  );

export type ListMaternalVisitsDueQuery = z.infer<typeof listMaternalVisitsDueQuerySchema>;
