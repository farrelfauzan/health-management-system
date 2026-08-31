import type { ClinicProfileView } from '@hms/shared-types';

import {
  clinicProfileControllerGetClinicProfileV1,
  getClinicProfileControllerGetClinicProfileV1QueryKey,
} from '#lib/api/generated/clinic-profile/clinic-profile';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * The clinic's identity. `logoUrl` in the payload is a short-lived signed URL
 * minted for that one response, so this query is not retried and not cached
 * beyond its default staleness — a preview that reloads is correct behaviour,
 * a stored URL would not be.
 */
export function useClinicProfile(enabled = true) {
  return useApiQuery<ClinicProfileView>({
    queryKey: getClinicProfileControllerGetClinicProfileV1QueryKey(),
    queryFn: (signal) => clinicProfileControllerGetClinicProfileV1(signal),
    errorMessage: 'Unable to load the clinic profile.',
    enabled,
    // A 404 is the not-configured-yet state, which retrying cannot improve.
    options: { retry: false },
  });
}
