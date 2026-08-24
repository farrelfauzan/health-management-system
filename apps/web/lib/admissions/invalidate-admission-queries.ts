import type { QueryClient } from '@tanstack/react-query';

import { invalidateRoomQueries } from '#lib/rooms/invalidate-room-queries';

/**
 * Admitting, transferring and discharging all move a bed, so the inventory and
 * the occupancy board are refreshed alongside the admission list. Discharging
 * also raises an invoice (IMP-15), which is why billing is on the list too — a
 * cashier looking at a stale invoice list would not see the bill that was just
 * created for the patient walking past them.
 */
const ADMISSION_QUERY_PREFIXES = ['/api/v1/admissions', '/api/v1/invoices'];

export async function invalidateAdmissionQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    predicate: (query) => {
      const [firstKey] = query.queryKey;
      return (
        typeof firstKey === 'string' &&
        ADMISSION_QUERY_PREFIXES.some((prefix) => firstKey.startsWith(prefix))
      );
    },
  });
  await invalidateRoomQueries(queryClient);
}
