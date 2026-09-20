import type { QueryClient } from '@tanstack/react-query';

const TAX_REPORTS_PATH = '/api/v1/tax/reports';

/** The year grid and every report detail at once: a draft or a finalize changes both. */
export async function invalidateTaxReportQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [path] = query.queryKey;
      return typeof path === 'string' && path.startsWith(TAX_REPORTS_PATH);
    },
  });
}
