import type { QueryClient } from '@tanstack/react-query';

const APPOINTMENT_QUERY_PREFIXES = ['/api/v1/appointments', '/api/v1/appointment-sessions'];

export async function invalidateAppointmentQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      if (typeof firstKey !== 'string') {
        return false;
      }
      return (
        APPOINTMENT_QUERY_PREFIXES.some((prefix) => firstKey.startsWith(prefix)) ||
        (firstKey.startsWith('/api/v1/doctors/') && firstKey.endsWith('/sessions'))
      );
    },
  });
}
