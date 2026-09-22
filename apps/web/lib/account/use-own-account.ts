import type { OwnAccountRecord } from '@hms/shared-types';

import {
  getOwnAccountControllerGetOwnAccountV1QueryKey,
  ownAccountControllerGetOwnAccountV1,
} from '#lib/api/generated/account/account';
import { useApiQuery } from '#lib/api/use-api-query';

/** The signed-in person's own account (P20-T05), as `me/account` answers it. */
export function useOwnAccount() {
  const query = useApiQuery<OwnAccountRecord>({
    queryKey: getOwnAccountControllerGetOwnAccountV1QueryKey(),
    queryFn: (signal) => ownAccountControllerGetOwnAccountV1(signal),
    errorMessage: 'Failed to load your account',
  });
  return { ...query, account: query.data };
}
