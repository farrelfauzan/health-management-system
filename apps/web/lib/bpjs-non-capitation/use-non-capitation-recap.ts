import type { NonCapitationRecapResponse } from '@hms/shared-types';

import {
  bpjsNonCapitationRecapControllerGetRecapV1,
  getBpjsNonCapitationRecapControllerGetRecapV1QueryKey,
} from '#lib/api/generated/bpjs-non-capitation/bpjs-non-capitation';
import { useApiQuery } from '#lib/api/use-api-query';

/** One month's non-capitation recap preview (P25-T16). */
export function useNonCapitationRecap(month: string) {
  const params = { month };
  return useApiQuery<NonCapitationRecapResponse>({
    queryKey: getBpjsNonCapitationRecapControllerGetRecapV1QueryKey(params),
    queryFn: (signal) => bpjsNonCapitationRecapControllerGetRecapV1(params, signal),
    errorMessage: 'Unable to load the non-capitation recap.',
  });
}
