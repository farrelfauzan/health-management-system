import type { QueryClient } from '@tanstack/react-query';

const DOCTOR_QUERY_PREFIXES = [
  '/api/v1/doctors',
  '/api/v1/doctor-patient-assignments',
  '/api/v1/patients',
];

export async function invalidateDoctorQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return (
        typeof firstKey === 'string' &&
        DOCTOR_QUERY_PREFIXES.some((prefix) => firstKey.startsWith(prefix))
      );
    },
  });
}
