import type { QueryClient } from '@tanstack/react-query';

const PATIENT_QUERY_PREFIXES = ['/api/v1/patients', '/api/v1/doctor-patient-assignments'];

export async function invalidatePatientQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return (
        typeof firstKey === 'string' &&
        PATIENT_QUERY_PREFIXES.some((prefix) => firstKey.startsWith(prefix))
      );
    },
  });
}
