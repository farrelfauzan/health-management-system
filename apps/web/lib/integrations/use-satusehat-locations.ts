import type { SatusehatLocationTreeView } from '@hms/shared-types';

import {
  getSatusehatLocationControllerListLocationsV1QueryKey,
  satusehatLocationControllerListLocationsV1,
} from '#lib/api/generated/satusehat/satusehat';
import { useApiQuery } from '#lib/api/use-api-query';

/** The clinic's SATUSEHAT Location tree, parents first (P24-T06). */
export function useSatusehatLocations() {
  const query = useApiQuery<SatusehatLocationTreeView>({
    queryKey: getSatusehatLocationControllerListLocationsV1QueryKey(),
    queryFn: (signal) => satusehatLocationControllerListLocationsV1(signal),
    errorMessage: 'Unable to load the SATUSEHAT location tree.',
  });
  return { ...query, nodes: query.data?.nodes ?? [] };
}
