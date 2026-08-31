import type { QueryClient } from '@tanstack/react-query';

import { getClinicProfileControllerGetClinicProfileV1QueryKey } from '#lib/api/generated/clinic-profile/clinic-profile';

/**
 * Refetches the profile after a save. Always a refetch rather than a cache
 * write of the mutation's own response: the response carries a freshly signed
 * `logoUrl`, and re-reading is what keeps a single code path minting it.
 */
export async function invalidateClinicProfileQueries(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: getClinicProfileControllerGetClinicProfileV1QueryKey(),
  });
}
