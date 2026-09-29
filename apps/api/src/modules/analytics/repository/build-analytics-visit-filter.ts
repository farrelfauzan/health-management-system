import type { AnalyticsSqlScope } from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';

/**
 * What every dashboard counts as a visit in the range, for a registration
 * aliased `r`: checked in or completed, registered in the range, narrowed by
 * clinician (through the encounter), poli and payer. A visit whose payer was
 * never recorded matches no payer (P29-T07).
 */
export function buildAnalyticsVisitFilter(scope: AnalyticsSqlScope): Prisma.Sql {
  const doctorFilter = scope.doctorId
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "encounters" fe
        WHERE fe."registration_id" = r."id" AND fe."doctor_id" = ${scope.doctorId}::uuid
          AND fe."deleted_at" IS NULL)`
    : Prisma.empty;
  const poliFilter = scope.specialtyId
    ? Prisma.sql`AND r."specialty_id" = ${scope.specialtyId}::uuid`
    : Prisma.empty;
  const payerFilter = scope.payerType
    ? Prisma.sql`AND r."payer_type" = ${scope.payerType}::payer_type`
    : Prisma.empty;
  return Prisma.sql`r."deleted_at" IS NULL
    AND r."status" IN ('CHECKED_IN', 'COMPLETED')
    AND r."registered_at" >= ${scope.startUtc}::timestamp
    AND r."registered_at" < ${scope.endUtc}::timestamp
    ${doctorFilter} ${poliFilter} ${payerFilter}`;
}
