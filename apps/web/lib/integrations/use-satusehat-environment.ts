import type { SatusehatEnvironmentStatus } from '@hms/shared-types';

import {
  getSatusehatSubmissionControllerGetEnvironmentV1QueryKey,
  satusehatSubmissionControllerGetEnvironmentV1,
} from '#lib/api/generated/satusehat/satusehat';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * Which SATUSEHAT platform this deployment reports to (P21-T06).
 *
 * Read once per visit rather than polled: it is derived from server
 * configuration, so it changes on a deploy and never between two requests.
 */
export function useSatusehatEnvironment() {
  const query = useApiQuery<SatusehatEnvironmentStatus>({
    queryKey: getSatusehatSubmissionControllerGetEnvironmentV1QueryKey(),
    queryFn: (signal) => satusehatSubmissionControllerGetEnvironmentV1(signal),
    errorMessage: 'Unable to read the SATUSEHAT environment.',
    options: { retry: false },
  });

  return { ...query, environment: query.data };
}
