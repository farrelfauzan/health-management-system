import type { AnalyticsSqlScope } from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';

/**
 * Narrows an invoice joined by `ANALYTICS_INVOICE_VISIT_JOINS` by clinician
 * (its encounter's), poli and payer (its visit's).
 */
export function buildAnalyticsInvoiceNarrowing(scope: AnalyticsSqlScope): Prisma.Sql {
  const doctorFilter = scope.doctorId
    ? Prisma.sql`AND e."doctor_id" = ${scope.doctorId}::uuid`
    : Prisma.empty;
  const poliFilter = scope.specialtyId
    ? Prisma.sql`AND r."specialty_id" = ${scope.specialtyId}::uuid`
    : Prisma.empty;
  const payerFilter = scope.payerType
    ? Prisma.sql`AND r."payer_type" = ${scope.payerType}::payer_type`
    : Prisma.empty;
  return Prisma.sql`${doctorFilter} ${poliFilter} ${payerFilter}`;
}
