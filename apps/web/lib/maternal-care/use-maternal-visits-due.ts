import type { MaternalVisitsDueResponse } from '@hms/shared-types';

import {
  getMaternalVisitDueControllerListDueV1QueryKey,
  maternalVisitDueControllerListDueV1,
} from '#lib/api/generated/maternal-care/maternal-care';
import { useApiQuery } from '#lib/api/use-api-query';

/** The "Jatuh tempo minggu ini" worklist (P25-T17): the API's default week. */
export function useMaternalVisitsDue(isEnabled: boolean) {
  const query = useApiQuery<MaternalVisitsDueResponse>({
    queryKey: getMaternalVisitDueControllerListDueV1QueryKey(),
    queryFn: (signal) => maternalVisitDueControllerListDueV1(undefined, signal),
    errorMessage: 'Failed to load the maternal due list',
    enabled: isEnabled,
  });

  return { ...query, items: query.data?.items ?? [] };
}
