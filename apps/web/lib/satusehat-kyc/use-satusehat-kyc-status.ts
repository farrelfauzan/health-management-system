import type { SatusehatKycStatusView } from '@hms/shared-types';

import {
  getSatusehatKycControllerGetStatusV1QueryKey,
  satusehatKycControllerGetStatusV1,
} from '#lib/api/generated/satusehat/satusehat';
import { useApiQuery } from '#lib/api/use-api-query';

/**
 * Whether the signed-in operator may start a SATUSEHAT KYC verification now
 * (P24-T16, FR-KYC-07). Asked only when the button could render at all —
 * the caller passes `enabled` from the feature flag and the ability — so a
 * clinic without SATUSEHAT never hits the gated route.
 */
export function useSatusehatKycStatus(enabled: boolean) {
  const query = useApiQuery<SatusehatKycStatusView>({
    queryKey: getSatusehatKycControllerGetStatusV1QueryKey(),
    queryFn: (signal) => satusehatKycControllerGetStatusV1(signal),
    errorMessage: 'Failed to load the SATUSEHAT KYC status',
    enabled,
  });
  return { ...query, status: query.data };
}
