import type { BpjsReferralResponse } from '@hms/shared-types';

import {
  encounterClinicalDataControllerGetBpjsReferralV1,
  getEncounterClinicalDataControllerGetBpjsReferralV1QueryKey,
} from '#lib/api/generated/encounters/encounters';
import { isApiStatusError } from '#lib/api/is-api-status-error';
import { useApiQuery } from '#lib/api/use-api-query';

const NOT_FOUND_STATUS = 404;

/**
 * Most encounters carry no rujukan, and the API answers that with a 404. That
 * is an ordinary empty state here, not a failure: it resolves to a null
 * referral, is not retried, and never shows an error to the doctor.
 */
export function useBpjsReferral(encounterId: string, isEnabled: boolean) {
  const query = useApiQuery<BpjsReferralResponse>({
    queryKey: getEncounterClinicalDataControllerGetBpjsReferralV1QueryKey(encounterId),
    queryFn: (signal) => encounterClinicalDataControllerGetBpjsReferralV1(encounterId, signal),
    errorMessage: 'Failed to load the BPJS referral',
    enabled: isEnabled,
    options: {
      retry: (failureCount, error) =>
        !isApiStatusError(error, NOT_FOUND_STATUS) && failureCount < 1,
    },
  });

  const isMissing = isApiStatusError(query.error, NOT_FOUND_STATUS);

  return {
    ...query,
    referral: query.data ?? null,
    isMissing,
    loadError: isMissing ? null : query.error,
  };
}
