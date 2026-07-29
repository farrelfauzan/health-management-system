import type { QueryClient } from '@tanstack/react-query';

/**
 * Settling an invoice moves money, so the cashier report has to follow it —
 * a payment recorded against a stale drawer total is the one number a clinic
 * owner will notice.
 */
const BILLING_QUERY_PREFIXES = [
  '/api/v1/invoices',
  '/api/v1/reports/cashier-daily',
  '/api/v1/service-tariffs',
];

export async function invalidateBillingQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return (
        typeof firstKey === 'string' &&
        BILLING_QUERY_PREFIXES.some((prefix) => firstKey.startsWith(prefix))
      );
    },
  });
}
