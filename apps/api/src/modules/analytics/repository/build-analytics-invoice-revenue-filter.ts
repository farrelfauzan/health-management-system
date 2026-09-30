import type { AnalyticsSqlScope } from '@hms/shared-types';

import { Prisma } from '../../../generated/prisma/client';
import { buildAnalyticsInvoiceNarrowing } from './build-analytics-invoice-narrowing';

/**
 * An invoice aliased `i` that counts as revenue in the range (Q-3): issued
 * in it, not voided, narrowed like every invoice figure. Shared by the
 * finance and pharmacy dashboards so medication revenue is one number.
 */
export function buildAnalyticsInvoiceRevenueFilter(scope: AnalyticsSqlScope): Prisma.Sql {
  return Prisma.sql`i."deleted_at" IS NULL
    AND i."status" IN ('ISSUED', 'PAID')
    AND i."issued_at" >= ${scope.startUtc}::timestamp
    AND i."issued_at" < ${scope.endUtc}::timestamp
    ${buildAnalyticsInvoiceNarrowing(scope)}`;
}
