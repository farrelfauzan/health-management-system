import type { QueryClient } from '@tanstack/react-query';

const CLINICIAN_FEE_PATH_PREFIXES = ['/api/v1/clinician-fee-rules', '/api/v1/clinician-fees'];

/** Every jasa medis read at once: a rule change is listed on the rules table. */
export async function invalidateClinicianFeeQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [path] = query.queryKey;
      return (
        typeof path === 'string' &&
        CLINICIAN_FEE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
      );
    },
  });
}
