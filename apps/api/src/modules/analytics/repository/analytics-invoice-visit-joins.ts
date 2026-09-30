import { Prisma } from '../../../generated/prisma/client';

/**
 * Joins an invoice aliased `i` to the visit it bills, aliased `r`: its own
 * registration for a walk-in lab bill, its encounter's for a consultation,
 * and for an inpatient bill the registration of the encounter the stay came
 * from. `e` is the invoice's own encounter, which is how the cashier report
 * credits a clinician; a bill without one is unattributed.
 */
export const ANALYTICS_INVOICE_VISIT_JOINS = Prisma.sql`LEFT JOIN "encounters" e ON e."id" = i."encounter_id"
  LEFT JOIN "admissions" ad ON ad."id" = i."admission_id"
  LEFT JOIN "encounters" se ON se."id" = ad."source_encounter_id"
  LEFT JOIN "registrations" r
    ON r."id" = COALESCE(i."registration_id", e."registration_id", se."registration_id")`;
