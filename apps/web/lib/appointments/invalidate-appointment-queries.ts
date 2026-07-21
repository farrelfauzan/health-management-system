import type { QueryClient } from '@tanstack/react-query';

const APPOINTMENT_QUERY_PREFIXES = ['/api/v1/appointments'];

export async function invalidateAppointmentQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return (
        typeof firstKey === 'string' &&
        APPOINTMENT_QUERY_PREFIXES.some((prefix) => firstKey.startsWith(prefix))
      );
    },
  });
}
